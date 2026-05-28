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
    totalPointsMin: { 
        type: Number, 
        default: 0, 
        min: 0,
        max: 999,
    },
    examCoverPhoto:{
        url:String,
        fileName:String
    },
    totalPointsMax: { 
        type: Number, 
        default: 100, 
        min: 1, 
        max: 1000,
    },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'questionModel' }],
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
    schoolId:{
        type: String,
        required: true,
    },
}, {
    timestamps: true
})

// Enrollment Schema
const enrollmentSchema = new mongoose.Schema({
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'examModel', required: true, index: true },
    studentId: { type: String, required: true, index: true }
}, { timestamps: true });

// Completion Schema (Handles marks and AI status)
const completionSchema = new mongoose.Schema({
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'examModel', required: true, index: true },
    studentId: { type: String, required: true, index: true },
    mark: { type: String, default: null },
    aiMarked: { type: Boolean, default: false }
}, { timestamps: true });

examSchema.path('questions').validate(function(value) {
  return value.length <= MAX_QUESTIONS;
}, `You can only have up to ${MAX_QUESTIONS} questions.`);

module.exports = {
    examModel: mongoose.model('examModel', examSchema),
    examEnrollmentModel: mongoose.model('examEnrollmentModel', enrollmentSchema),
    examCompletionModel: mongoose.model('examCompletionModel', completionSchema)
};
