const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io');
const conversationModel = require('../models/conversation-model');
const messageModel = require('../models/messenger-model');

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

        // For each conversation, fetch the most recent message
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

    console.log(newConversation)

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

module.exports = router;
