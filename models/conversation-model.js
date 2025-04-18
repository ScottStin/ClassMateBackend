const mongoose = require('mongoose');

const conversationSchema = mongoose.Schema({
    id:{
        type: String,
    },
    groupName:{
        type: String,
    },
    participantIds:[{
        type: String,
    }],
    mostRecentMessage:{
        senderId: { type: String, default: null },
        messageText: { type: String, default: null },
        createdAt: { type: String, default: null },
    },
    usersTyping:[{
        type: String,
        required: false,
    }],

    // --- params for group:
    groupName:{
        type: String,
        required: false,
    },
    groupAdminId:{
        type: String,
        required: false,
    },
    image:{
        url:String,
        fileName:String,
    },
})

module.exports = mongoose.model('conversationModel', conversationSchema);
