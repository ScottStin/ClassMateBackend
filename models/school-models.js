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
        shadow:String
    },
    primaryButtonBackgroundColor:{
        String
    },
    primaryButtonTextColor:{
        String
    },
    lessonTypes: [
        {
            name: String,
            shortName: String
        }
    ]
}, {
    timestamps: true
})

module.exports = mongoose.model('schoolModel', schoolSchema);
