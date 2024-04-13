const mongoose = require('mongoose');

const schoolSchema = mongoose.Schema({
    name:{
        type: String,
    },
    nationality:{
        type: String,
    },
    email:{
        type: String,
    },
    phone:{
        type: String,
    },
    address:{
        type: String,
    },
    hashedPassword:{
        type: String,
    },
    logo:{
        url:String,
        filename:String
    },
    description:{
        type: String,
    },
    backgroundImage: {
        name:String,
        label:String,
        shadow:String,
        type: { type: String, default: null },
    },
    primaryButtonBackgroundColor:{
        type: String,
    },
    primaryButtonTextColor:{
        type: String,
    },
    lessonTypes: [
        {
            name: String,
            shortName: String,
        }
    ]
}, {
    timestamps: true
})

module.exports = mongoose.model('schoolModel', schoolSchema);
