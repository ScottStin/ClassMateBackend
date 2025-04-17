const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function
const messageModel = require('../models/messenger-model');

router.get('/', async function (req, res) {
  try {
    const currentUserId = req.query.currentUserId;
    const unreadOnly = req.query.unreadOnly === 'true';
    const conversationId = req.query.conversationId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'Missing currentUserId' });
    }

    let filter;

    if (unreadOnly) {
      // Only get messages where the recipient is currentUserId and seenAt is null/undefined
      filter = {
        'recipients': {
          $elemMatch: {
            userId: currentUserId,
            seenAt: { $in: [null, undefined] }
          }
        }
      };
    } else {
      // Get all messages where user is sender or recipient
      filter = {
        $or: [
          { senderId: currentUserId },
          { 'recipients.userId': currentUserId }
        ]
      };
    }

    // If conversationId is provided, add it to the filter
    if (conversationId) {
    filter = {
      ...filter,
      conversationId: conversationId,
    };
  }

    const messages = await messageModel.find(filter);

    res.json(messages);
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get('/get-messages-for-conversation', async function (req, res) {
  try {
    const currentUserId = req.query.currentUserId;

    if (!currentUserId) {
      return res.status(400).json({ error: 'Missing currentUserId' });
    }

    let filter;

    if (unreadOnly) {
      // Only get messages where the recipient is currentUserId and seenAt is null/undefined
      filter = {
        'recipients': {
          $elemMatch: {
            userId: currentUserId,
            seenAt: { $in: [null, undefined] }
          }
        }
      };
    } else {
      // Get all messages where user is sender or recipient
      filter = {
        $or: [
          { senderId: currentUserId },
          { 'recipients.userId': currentUserId }
        ]
      };
    }

    const messages = await messageModel.find(filter);

    res.json(messages);
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get('/groups', async function (req, res) {
  const demoChatGroups = [
    {
      _id: 'group1',
      groupName: 'Project Alpha',
      members: [
        { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T10:00:00Z' },
        { userId: '67e51e7a31c4f5a6cca28572', seenAt: '2025-03-19T12:00:00Z' },
        { userId: '67e51ee031c4f5a6cca2857e', seenAt: '2025-03-18T15:30:00Z' },
      ],
    },
    {
      _id: 'group2',
      groupName: 'Friends Chat',
      members: [
        { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T09:30:00Z' },
        { userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T11:00:00Z' },
      ],
    },
  ];

    try {
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        const test = demoChatGroups.filter((group) =>
            group.members.map((member) => member.userId).includes(currentUserId)
          );
        res.json(test);
    } catch (error) {
        console.error("Error getting message groups:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new-message', async (req, res) => {
  try {
    const newMessage = await messageModel.create({...req.body, createdAt: new Date()});
    await newMessage.save();
    res.status(201).json(newMessage);

    // Emit event to all connected clients after message is created
    if(newMessage.recipients) {
      for(const recipient of newMessage.recipients.map((recipient) => recipient.userId)) {
        const io = getIo(); // Safely get the initialized Socket.IO instance
        io.emit('messageEvent-' + recipient, {action: 'messageSent', data: newMessage});
      }
    }

  } catch (error) {
    console.error("Error creating new message:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/mark-as-seen', async (req, res) => {
  try {
    const { messagesToMarkIds, currentUserId } = req.body;

    // Fetch the messages by their IDs
    const messages = await messageModel.find({ '_id': { $in: messagesToMarkIds } });

    // Loop over each message
    const updatePromises = messages.map(async (message) => {
      // Check if the current user is in the recipients array
      const recipientIndex = message.recipients.findIndex(
        (recipient) => recipient.userId === currentUserId
      );

      if (recipientIndex !== -1) {
        // Update the seenAt property for the matched recipient
        message.recipients[recipientIndex].seenAt = new Date();  //  moment().toISOString(); Get current time in ISO format

        // Save the updated message
        await message.save();
      }
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    // Respond with success
    res.status(200).json({ message: 'Messages marked as seen' });
  } catch (error) {
    console.error('Error marking messages as seen:', error);
    res.status(500).json({ error: 'Failed to mark messages as seen' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const updatedMessage = await messageModel.findById(req.params.id);

    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    updatedMessage.messageText = req.body.messageText;
    updatedMessage.edited = new Date();
  
    await updatedMessage.save();
    res.status(201).json(updatedMessage);

    // Emit event to all connected clients after message is updated
    const io = getIo();
    if(updatedMessage.recipients) {
      for(const recipient of updatedMessage.recipients.map((recipient) => recipient.userId)) {
        io.emit('messageEvent-' + recipient, {action: 'messageUpdated', data: updatedMessage});
      }
    }
    io.emit('messageEvent-' + updatedMessage.senderId, {action: 'messageUpdated', data: updatedMessage});
  } catch (error) {
    console.error("Error updating new message:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedMessage = await messageModel.findById(req.params.id);
    if (!deletedMessage) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Mark as deleted and clear unwanted fields
    deletedMessage.deleted = true;
    deletedMessage.messageText = ' ';
    deletedMessage.attachment = undefined;
    deletedMessage.edited = undefined;
    // todo - remove cloudinary attachment
  
    // Save the changes
    await deletedMessage.save();
    res.status(200).json(deletedMessage);

    // Emit event to all connected clients after message is deleted
    const io = getIo();
    if(deletedMessage.recipients) {
      for(const recipient of deletedMessage.recipients.map((recipient) => recipient.userId)) {
        io.emit('messageEvent-' + recipient, {action: 'messageDeleted', data: deletedMessage});
      }
    }
    io.emit('messageEvent-' + deletedMessage.senderId, {action: 'messageDeleted', data: deletedMessage});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
