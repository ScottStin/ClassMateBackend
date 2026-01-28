const mongoose = require('mongoose');
const MAX_SUB_QUESTIONS = 100;
const { courseworkPageElementSchema } = require('./coursework-model');

const questionSchema = mongoose.Schema({
    name: { type: String, required: true, maxlength: 50, },
    examId: { type: String, required: true }, // note - also used for courses, not just exams
    writtenPrompt: { type: String, default: null, maxlength: 500, },
    teacherFeedback: { type: Boolean, default: null },
    autoMarking: { type: Boolean, default: null },
    type: { type: String, required: true },
    time: { type: Number, default: null },
    randomQuestionOrder: { type: Boolean, default: null },
    partialMarking: { type: Boolean, default: null },
    multipleChoiceQuestionList: [{
        text: { type: String, required: true },
        correct: { type: Boolean, required: true }
    }],
    reorderSentenceQuestionList: [{
        text: { type: String, required: true },
    }],
    fillBlanksQuestionList: [{
        text: { type: String, required: true },
        blanks: [{
        text: { type: String },
        correctSelectOptionIndex: { type: Number, default: null }
        }]
    }],
    matchOptionQuestionList: [{
        leftOption: { type: String, required: true },
        rightOption: { type: String, required: true }
    }],
    courseworkInfoPageDetails: [courseworkPageElementSchema],
    totalPointsMin: { type: Number, default: 0, max:999, min:0 },
    totalPointsMax: { type: Number, default: 5, max:1000, min:1 },
    length: { type: Number, default: null, min:1, max: 600},
    limitAudioAttempts: { type: Number, default: null, min:1, max: 10},
    prompt1: {
        fileString: { type: String, default: null },
        type: { type: String, default: null },
    },
    prompt2: {
        fileString: { type: String, default: null },
        type: { type: String, default: null },
    },
    prompt3: {
        fileString: { type: String, default: null },
        type: { type: String, default: null },
    },
    subQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'questionModel'
    }],
    studentsCompleted: [{
        studentId: { type: String },
        dateComplete: { type: Date, default: null },
    }], // for coursework only
    studentResponse: [{
        studentId: { type: String, default: null },
        response: { type: String, default: null },
        mark: { 
            vocabMark: {type: String, default: null}, 
            grammarMark: {type: String, default: null},
            contentMark: {type: String, default: null},
            fluencyMark: {type: String, default: null},
            structureMark: {type: String, default: null},
            pronunciationMark: {type: String, default: null},
            accuracyMark: {type: String, default: null},
            totalMark: {type: String, default: null},
         },
        feedback: { text: {type: String, default: null}, teacher: {type: String, default: null} }
      }],
    parent: { type: String, default: null },
}, { timestamps: true });

questionSchema.path('subQuestions').validate(function(value) {
  return value.length <= MAX_SUB_QUESTIONS;
}, `You can only have up to ${MAX_SUB_QUESTIONS} sub-questions.`);

module.exports = mongoose.model('questionModel', questionSchema);
