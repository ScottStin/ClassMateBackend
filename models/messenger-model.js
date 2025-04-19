const mongoose = require('mongoose');

const messageRecipientsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    seenAt: {
        type: Date,
        required: false,
    },
});

const messageAttachmentSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
    },
    fileName: {
        type: String,
        required: true,
    },
});

// const chatGroupSchema = new mongoose.Schema({
//     groupName: {
//         type: String,
//         required: true,
//     },
//     members: [messageRecipientsSchema],
// });

const messageSchema = new mongoose.Schema({
    messageText: {
        type: String,
        required: true,
    },
    senderId: {
        type: String,
        required: true,
    },
    recipients: {
        type: [messageRecipientsSchema],
        default: [],
    },
    deleted: {
        type: Boolean,
        required: true,
    },
    edited: {
        type: Date,
        required: false,
    },
    attachment: messageAttachmentSchema,
    // chatGroupId: {
    //     type: String,
    //     required: false,
    // },
    conversationId: {
        type: String,
        required: false,
    },
    createdAt: {
        type: String,
        required: true,
    },
    parentMessageId: {
        type: String,
        required: false,
    },
    savedByIds: {
        type: [String],
        default: [],
    },
    replies: {
        type: [this], // Self-referencing array of messages (replies)
        default: [],
    },
    adminMessage: {
        type: Boolean,
        required: false,
    }, // note - admin messages are things like 'John started a new group' or 'John invited you to join a group'. These cannot be deleted or edited.
});

module.exports = mongoose.model('messageModel', messageSchema);
