const mongoose = require('mongoose');

const conversationSchema = mongoose.Schema({
    id:{
        type: String,
    },
    // title:{
    //     type: String,
    // },
    participantIds:[{
        type: String,
    }],
    // hasUnreadMessage:{
    //     type: Boolean,
    // },
    mostRecentMessage:{
        senderId: { type: String, default: null },
        messageText: { type: String, default: null },
        createdAt: { type: String, default: null },
    },
    usersTyping:[{
        type: String,
        required: false,
    }],
})

module.exports = mongoose.model('conversationModel', conversationSchema);
