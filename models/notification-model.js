const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
    id:{
        type: String,
    },
    schoolId:{
        type: String,
    },
    createdBy:{
        type: String,
    },
    message:{
        type: String,
    },
    dateSent:{
        type: Number,
    },
    recipients:[
        { type: String } // user ids
    ],
    seenBy:[
        { type: String }
    ],
}, {
    timestamps: true
})

module.exports = mongoose.model('notificationModel', notificationSchema);
