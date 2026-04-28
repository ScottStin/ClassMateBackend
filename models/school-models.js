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
    applyOrbAffect: {
    type: Boolean,
    default: true
    },
    sideMenuTransparent: {
    type: String,
    default: 'opaque'
    },
    primaryButtonTextColor:{
        type: String,
    },
    lessonTypes: [
        {
            name: String,
            shortName: String,
        }
    ],
    stripe: {
        stripeAccountId: {
            type: String,
            default: null
        },
        setupComplete: {
            type: Boolean,
            default: false
        },
        chargesEnabled: {
            type: Boolean,
            default: false
        },
        demoMode: {
            type: Boolean,
            default: false
        }, // use demoMode if school doesn't have a stripe id but we still want to give functionality for testing purposes.
    },
}, {
    timestamps: true
})

module.exports = mongoose.model('schoolModel', schoolSchema);
