const mongoose = require('mongoose');

function limitTo100(val) {
    return val.length <= 100;
}

const enrolmentSchema = new mongoose.Schema({
    studentId: { 
        type: String, 
        required: true 
    },
    enrolmentMethod: {
        type: String,
        required: true,
        enum: ['subscription-package', 'one-time-payment-package', 'combo', 'casual'],
    }
}, { _id: false });

const lessonSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
        required: true,
        maxlength: 50,
    },
    schoolId:{
        type: String,
    },
    description:{
        type: String,
        maxlength: 250,
    },
    level: {
        type: Array, // enum: ['A1 Beginner','A2 Lower-Intermediate','B1 Intermediate','B2 Upper-Intermediate','C1 Advanced','C2 Native']
        // required: true,
    },
    type: {
        name: String,
        shortName: String,
    },
    duration: {
        type: Number,
        min: 1, 
        max: 999,
    },
    teacherId: {
        type:String,
    },
    maxStudents: {
        type: Number,
        required: true,
    },
    startTime: {
        type: String,
        required:true,
    },
    studentsEnrolled: {
        type: [enrolmentSchema],
        default: [],
        validate: [limitTo100, '{PATH} exceeds the maximum capacity of 100 enrolled students.']
    },
    lessonStudentsAttended: {
        type: [String],
        default: [],
        validate: [limitTo100, '{PATH} exceeds the maximum cap of 100 attended records.']
    },
    casualPrice:{
        type:Number,
        min: 0, 
        max: 1000,
    },
    status:{
        type: String // started, finished
    },
    recording: {
        type: String
    },
}, {
    timestamps: true
})


module.exports = mongoose.model('lessonModel', lessonSchema);
