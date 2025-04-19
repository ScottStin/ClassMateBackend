const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io');
const conversationModel = require('../models/conversation-model');
const messageModel = require('../models/messenger-model');
const userModel = require('../models/user-models');
const { cloudinary, storage } = require('../cloudinary');
const multer = require('multer');
const upload = multer({ storage });

router.get('/', async function (req, res) {
    try {
        const currentUserId = req.query.currentUserId;

        if (!currentUserId) {
            return res.status(400).json({ error: 'Missing currentUserId' });
        }

        // Find all conversations for this user
        const conversations = await conversationModel.find({
            participantIds: currentUserId,
        });

        // For each conversation, fetch the most recent message // TODO - add this to a reusable function
        const populatedConversations = await Promise.all(
            conversations.map(async (conversation) => {
                const recentMessage = await messageModel
                    .findOne({ conversationId: conversation._id })
                    .sort({ createdAt: -1 }) // most recent first
                    .lean(); // improve performance if we only need plain JS object

                // Attach the most recent message to the conversation
                if (recentMessage) {
                    conversation = conversation.toObject(); // convert mongoose doc to plain object
                    conversation.mostRecentMessage = {
                        senderId: recentMessage.senderId,
                        messageText: recentMessage.messageText,
                        createdAt: recentMessage.createdAt,
                    };
                }

                return conversation;
            })
        );

        res.json(populatedConversations);
    } catch (error) {
        console.error("Error getting conversations:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/', async (req, res) => {
  try {
    const newConversation = await conversationModel.create(req.body);
    await newConversation.save();
    res.status(201).json(newConversation);

    // --- upload user photo to cloudinary:
    if(newConversation.image && newConversation.url & newConversation.file) {
        await cloudinary.uploader.upload(newConversation.image.url, {folder: `${req.body.schoolId}/message-group-images/${newConversation._id}`}, async (err, result)=>{
        if (err) return console.log(err);  
        newConversation.image = {url:result.url, fileName:result.public_id};
        await newConversation.save();
        })
    }
    
    // add first message to group:
    if(newConversation.groupName) {
        const firstGroupMessage = {
          conversationId: newConversation._id,
          messageText: `${req.body.groupAdminName} created a new group.`,
          createdAt: new Date(),
          deleted: false,
          recipients: newConversation.participantIds.filter((participantId) => participantId !== req.body.groupAdminId).map((participantId) => ({ userId: participantId })),
          senderId: req.body.groupAdminId,
          adminMessage: true,
      }
      const newMessage = await messageModel.create(firstGroupMessage);
      await newMessage.save();

      newConversation.mostRecentMessage = {
        senderId: newMessage.senderId,
        messageText: newMessage.messageText,
        createdAt: newMessage.createdAt,
    };
    }

    // Emit event to all connected clients after conversation is created
    if(newConversation.participantIds) {
      for(const participantId of newConversation.participantIds) {
        const io = getIo(); // Safely get the initialized Socket.IO instance
        io.emit('conversationEvent-' + participantId, {action: 'newConversation', data: newConversation});
      }
    }

  } catch (error) {
    console.error("Error creating new conversation:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/update-group/:id', async (req, res) => {
  try {
    const io = getIo();
    const updatedGroup = await conversationModel.findById(req.params.id);

    if (!updatedGroup) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Get list of group member ids before update:
    const previousParticipantIds = updatedGroup.participantIds.map(id => id.toString());
    const previousGroupName = updatedGroup.groupName;

    // Get new list of participantIds from request
    const newParticipantIds = req.body.participantIds.map(id => id.toString());

    // Find added and removed participants
    const addedParticipants = newParticipantIds.filter(id => !previousParticipantIds.includes(id));
    const removedParticipants = previousParticipantIds.filter(id => !newParticipantIds.includes(id));

    // Log or handle them as needed
    console.log('Added Participants:', addedParticipants);
    console.log('Removed Participants:', removedParticipants);

    // update group:
    updatedGroup.participantIds = req.body.participantIds;
    updatedGroup.groupName = req.body.groupName;

    const newMessage = [];

    // add  message to group that users were added/removed:
    for(let addedParticipantId of addedParticipants) {
      const user = await userModel.findById(addedParticipantId);

      const newGroupMessage = {
        conversationId: updatedGroup._id,
        messageText: `${req.body.groupAdminName} added ${user?.name ?? "a user"} to this group.`,
        createdAt: new Date(),
        deleted: false,
        recipients: updatedGroup.participantIds.filter((participantId) => participantId !== req.body.groupAdminId).map((participantId) => ({ userId: participantId })),
        senderId: req.body.groupAdminId,
        adminMessage: true,
      }

      newMessage.push(newGroupMessage)
  
      updatedGroup.mostRecentMessage = {
        senderId: newMessage.senderId,
        messageText: newMessage.messageText,
        createdAt: newMessage.createdAt,
      };
    }
  
    for(let removedParticipantId of removedParticipants) {
      const user = await userModel.findById(removedParticipantId);
  
      const newGroupMessage = {
        conversationId: updatedGroup._id,
        messageText: `${req.body.groupAdminName} removed ${user?.name ?? "a user"} from this group.`,
        createdAt: new Date(),
        deleted: false,
        recipients: updatedGroup.participantIds.filter((participantId) => participantId !== req.body.groupAdminId).map((participantId) => ({ userId: participantId })),
        senderId: req.body.groupAdminId,
        adminMessage: true,
      }

      newMessage.push(newGroupMessage)

      updatedGroup.mostRecentMessage = {
        senderId: newMessage.senderId,
        messageText: newMessage.messageText,
        createdAt: newMessage.createdAt,
      };
    }

    if(previousGroupName !== req.body.groupName) {
      const newGroupMessage = {
        conversationId: updatedGroup._id,
        messageText: `${req.body.groupAdminName} changed the group name from ${previousGroupName} to ${req.body.groupName}`,
        createdAt: new Date(),
        deleted: false,
        recipients: updatedGroup.participantIds.filter((participantId) => participantId !== req.body.groupAdminId).map((participantId) => ({ userId: participantId })),
        senderId: req.body.groupAdminId,
        adminMessage: true,
      }

      newMessage.push(newGroupMessage)

      updatedGroup.mostRecentMessage = {
        senderId: newMessage.senderId,
        messageText: newMessage.messageText,
        createdAt: newMessage.createdAt,
      };
    }

    // --- upload user photo to cloudinary:
    // if(updatedGroup.image && updatedGroup.url & updatedGroup.file) {
    //   await cloudinary.uploader.upload(updatedGroup.image.url, {folder: `${req.body.schoolId}/message-group-images/${updatedGroup._id}`}, async (err, result)=>{
    //   if (err) return console.log(err);  
    //   updatedGroup.image = {url:result.url, fileName:result.public_id};
    //   await updatedGroup.save();
    //   })
    // }
  
    await updatedGroup.save();
    res.status(201).json(updatedGroup);

    // Emit event to all connected clients after conversation is updated
    if(updatedGroup.participantIds) {
      for(const participantId of updatedGroup.participantIds) {
        io.emit('conversationEvent-' + participantId, {action: 'updateGroup', data: updatedGroup});
      }
    }

    // save the new messages that were created previously:
    for(let message of newMessage) {
      const saveMessage = await messageModel.create(message);
      await saveMessage.save();
      for(const participantId of updatedGroup.participantIds) {
        io.emit('messageEvent-' + participantId, {action: 'messageSent', data: saveMessage});
      }
    }

    // Emit event to all removed members after conversation is updated
    if(removedParticipants) {
      for(const removedParticipant of removedParticipants) {
        io.emit('conversationEvent-' + removedParticipant, {action: 'updateGroup', data: updatedGroup});
      }
    }
  } catch (error) {
    console.error("Error updating new message:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/user-typing/:id', async (req, res) => {
    try {
      const conversationId = req.params.id;
      const { isCurrentUserTyping, currentUserId } = req.body;
  
      let conversation = await conversationModel.findById(conversationId);
      if (!conversation) {
        return res.status(404).send("Conversation not found");
      }
  
      const userTypingSet = new Set(conversation.usersTyping.map(id => id.toString()));
  
      if (isCurrentUserTyping) {
        // Add user ID if it's not already in the array
        userTypingSet.add(currentUserId.toString());
      } else {
        // Remove user ID if it's there
        userTypingSet.delete(currentUserId.toString());
      }
  
      // Convert back to array and save
      conversation.usersTyping = Array.from(userTypingSet);
      const updatedConversation = await conversation.save();
      res.status(201).json(updatedConversation);

    // Emit event to all connected clients after conversation is updated
    if (updatedConversation.participantIds) {
        for(const participantId of updatedConversation.participantIds) {
          const io = getIo();
          io.emit('conversationEvent-' + participantId, {action: 'userTyping', data: updatedConversation});
        }
    }

    } catch (error) {
      console.error("Error updating conversation typing status:", error);
      res.status(500).send("Internal Server Error");
    }
  });

module.exports = router;
