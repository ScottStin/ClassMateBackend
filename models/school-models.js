const mongoose = require('mongoose');

const schoolSchema = mongoose.Schema({
    name:{
        type: String,
        required: true,
        maxlength: 250,
    },
    nationality:{
        type: String,
        maxlength: 250,
    },
    email:{
        type: String,
        maxlength: 250,
    },
    phone:{
        type: String,
        maxlength: 250,
    },
    address:{
        type: String,
        maxlength: 250,
    },
    hashedPassword:{
        type: String,
    },
    logoPrimary:{
        url:String,
        filename:String
    },
    logoSecondary:{
        url:String,
        filename:String
    },
    description:{
        type: String,
        maxlength: 250,
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
    warnColor:{
        type: String,
    },
    errorColor:{
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
