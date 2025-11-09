const mongoose = require('mongoose');
const MAX_QUESTIONS = 100;

const examSchema = mongoose.Schema({
    id:{
        type: String,
    },
    name:{
        type: String,
        required: true,
        maxlength: 50,
    },
    description:{
        type: String,
        required: true,
        maxlength: 250,
    },
    instructions:{
        type: String,
        required: true,
        maxlength: 500,
    },
    studentsEnrolled:[
        { type: String }
    ],
    studentsCompleted: [
        {
            studentId: { type: String },
            mark: {type: String, default: null}
        }
    ],
    totalPointsMin: { 
        type: Number, 
        default: 0, 
        min: 0, 
        max: 999,
    },
    totalPointsMax: { 
        type: Number, 
        default: 100, 
        min: 1, 
        max: 1000,
    },
    questions: [
        { type: String }
    ],
    casualPrice:{ 
        type: Number,
        default: 0, 
        min: 0, 
        max: 1000,
    },
    default:{
        type: Boolean,
        default: false,
        required: true,
    },
    assignedTeacherId:{
        type: String,
        required: true,
    },
    aiMarkingComplete:[
        {
            studentId: { type: String },
        }
    ],
    schoolId:{
        type: String,
        required: true,
    },
}, {
    timestamps: true
})

examSchema.path('questions').validate(function(value) {
  return value.length <= MAX_QUESTIONS;
}, `You can only have up to ${MAX_QUESTIONS} questions.`);

module.exports = mongoose.model('examModel', examSchema);
