const mongoose = require('mongoose');

const MAX_SUB_QUESTIONS = 100;
const MAX_LIST_ITEMS = 20;

const { courseworkPageElementSchema } = require('./coursework-model');

// ==========================================
// 1. PRIMARY QUESTION SCHEMA
// ==========================================
const questionSchema = mongoose.Schema({
    name: { type: String, required: true, maxlength: 50 },
    examId: { type: String, required: true },
    writtenPrompt: { type: String, default: null, maxlength: 500 },
    teacherFeedback: { type: Boolean, default: null },
    autoMarking: { type: Boolean, default: null },
    type: { type: String, required: true },
    time: { type: Number, default: null },
    randomQuestionOrder: { type: Boolean, default: null },
    partialMarking: { type: Boolean, default: null },
    caseSensitive: { type: Boolean, default: null },
    multipleChoiceQuestionList: [{
        text: { type: String, required: true },
        correct: { type: Boolean, required: true },
        incorrectMessageHint: { type: String, required: false, maxlength: 500 },
    }],
    reorderSentenceQuestionList: [{
        text: { type: String, required: true },
    }],
    fillBlanksQuestionList: [{
        text: { type: String, required: true },
        blanks: [{
            text: { type: String },
            correctSelectOptionIndex: { type: Number, default: null },
            incorrectMessageHint: { type: String, required: false, maxlength: 500 },
        }]
    }],
    matchOptionQuestionList: [{
        leftOption: { type: String, required: true },
        rightOption: { type: String, required: true }
    }],
    courseworkInfoPageDetails: [courseworkPageElementSchema],
    totalPointsMin: { type: Number, default: 0, max: 999, min: 0 },
    totalPointsMax: { type: Number, default: 5, max: 1000, min: 1 },
    length: { type: Number, default: null, min: 1, max: 600 },
    limitAudioAttempts: { type: Number, default: null, min: 1, max: 10 },
    correctMessageHint: { type: String, required: false, maxlength: 500 },
    incorrectMessageHint: { type: String, required: false, maxlength: 500 },
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
    parent: { type: String, default: null },
}, { timestamps: true });

// ==========================================
// ARRAY LENGTH VALIDATORS
// ==========================================

questionSchema.path('subQuestions').validate(function(value) {
  return value.length <= MAX_SUB_QUESTIONS;
}, `You can only have up to ${MAX_SUB_QUESTIONS} sub-questions.`);

// Reusable validator function for the question lists
const listLengthValidator = function(value) {
    return value.length <= MAX_LIST_ITEMS;
};

questionSchema.path('multipleChoiceQuestionList').validate(
    listLengthValidator, 
    `Multiple choice list cannot exceed ${MAX_LIST_ITEMS} items.`
);

questionSchema.path('reorderSentenceQuestionList').validate(
    listLengthValidator, 
    `Reorder sentence list cannot exceed ${MAX_LIST_ITEMS} items.`
);

questionSchema.path('fillBlanksQuestionList').validate(
    listLengthValidator, 
    `Fill in the blanks list cannot exceed ${MAX_LIST_ITEMS} items.`
);

questionSchema.path('matchOptionQuestionList').validate(
    listLengthValidator, 
    `Match options list cannot exceed ${MAX_LIST_ITEMS} items.`
);

// ==========================================
// 2. QUESTION SUBMISSION SCHEMA
// ==========================================
const questionSubmissionSchema = mongoose.Schema({
    questionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'questionModel', 
        required: true 
    },
    studentId: { 
        type: String, 
        required: true 
    },
    examId: { 
        type: String, 
        required: true 
    },
    dateComplete: { 
        type: Date, 
        default: Date.now 
    },
    response: { 
        type: String, 
        default: null 
    },
    mark: { 
        vocabMark: { type: String, default: null }, 
        grammarMark: { type: String, default: null },
        contentMark: { type: String, default: null },
        fluencyMark: { type: String, default: null },
        structureMark: { type: String, default: null },
        pronunciationMark: { type: String, default: null },
        accuracyMark: { type: String, default: null },
        totalMark: { type: String, default: null },
    },
    feedback: { 
        text: { type: String, default: null }, 
        teacher: { type: String, default: null } 
    }
}, { timestamps: true });

// Compound indexes to keep queries fast and prevent duplicates
questionSubmissionSchema.index({ examId: 1, studentId: 1 });
questionSubmissionSchema.index({ questionId: 1, studentId: 1 }, { unique: true });


// ==========================================
// 3. COMPILE AND EXPORT MODELS
// ==========================================
const questionModel = mongoose.model('questionModel', questionSchema);
const questionSubmissionModel = mongoose.model('questionSubmissionModel', questionSubmissionSchema);

module.exports = {
    questionModel,
    questionSubmissionModel
};
