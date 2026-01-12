const mongoose = require('mongoose');
const {
  studentBillingSchema,
  schoolBillingSchema
} = require('./billing-model');

const userSchema = mongoose.Schema({
    name:{
        type: String,
        required: true,
        maxlength: 50,
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
        required: true,
        maxlength: 50,
    },
    phone:{
        type: String,
        maxlength: 50,
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
        maxlength: 250,
    },

    studentBilling: {
        type: studentBillingSchema,
    },

    schoolBilling: {
        type: schoolBillingSchema,
    },
}, {
    timestamps: true
})

module.exports = mongoose.model('userModel', userSchema);
