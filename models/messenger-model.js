const mongoose = require('mongoose');

function limitTo100(val) {
    return val.length <= 100;
}

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
        validate: [limitTo100, '{PATH} exceeds the limit of 100 recipients.']
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
        validate: [limitTo100, '{PATH} exceeds the limit of 100 saved references.']
    },
    replies: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "messageModel"
        }],
        default: [],
        validate: [limitTo100, '{PATH} exceeds the limit of 100 replies.']
    },
    parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "messageModel"
    },
    adminMessage: {
        type: Boolean,
        required: false,
    }, // note - admin messages are things like 'John started a new group' or 'John invited you to join a group'. These cannot be deleted or edited.
});

module.exports = mongoose.model('messageModel', messageSchema);
