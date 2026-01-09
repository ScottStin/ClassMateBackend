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
        maxlength: 250,
    },
    dateSent:{
        type: Number,
    },
    link:{
        type: String, default: null 
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
