const mongoose = require('mongoose');

const questionSchema = mongoose.Schema({
    name: { type: String, required: true },
    writtenPrompt: { type: String, default: null },
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
        blanks: [{ text: {type: String } }]
    }],
    matchOptionQuestionList: [{
        leftOption: { type: String, required: true },
        rightOption: { type: String, required: true }
    }],
    totalPointsMin: { type: Number, default: 0 },
    totalPointsMax: { type: Number, default: 5 },
    length: { type: Number, default: null },
    prompt1: {
        fileString: { type: String, default: null },
        type: { type: String, default: null },
    },
    prompt2: {
        fileString: { type: String, default: null },
        type: { type: String, default: null },
    },
    subQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'questionModel'
    }],
    studentResponse: [{
        student: { type: String, default: null },
        response: { type: String, default: null },
        mark: { 
            vocabMark: {type: String, default: null}, 
            grammarMark: {type: String, default: null},
            contentMark: {type: String, default: null},
            fluencyMark: {type: String, default: null},
            pronunciationMark: {type: String, default: null},
            accuracyMark: {type: String, default: null},
            totalMark: {type: String, default: null},
         },
        feedback: { text: {type: String, default: null}, teacher: {type: String, default: null} }
      }],
    parent: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('questionModel', questionSchema);
