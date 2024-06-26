const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    name:{
        type: String,
    },
    userType:{
        type: String,
    },
    schoolId:{
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
    profilePicture:{
        url:String,
        fileName:String
    },
    package:{
        type: String,
    },
    level:{
        longName: String,
        shortName: String
    },
    // level:{
    //     type: String,        
    //     enum: ["A1 Beginner","A2 Lower-Intermediate","B1 Intermediate","B2 Upper-Intermediate","C1 Advanced","C2 Native"]
    // },
    eltComplete:{
        type: Boolean,
        // default:false
    },
    statement:{
        type: String,
    },
}, {
    timestamps: true
})

module.exports = mongoose.model('userModel', userSchema);
