const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
    id:{
        type: String,
    },
    schoolId:{
        type: String,
    },
    createBy:{
        type: String,
    },
    message:{
        type: String,
    },
    dateSent:{
        type: Number,
    },
    recipients:[
        { type: String }
    ],
    seenBy:[
        { type: String }
    ],
}, {
    timestamps: true
})

module.exports = mongoose.model('notificationModel', notificationSchema);
