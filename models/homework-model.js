const mongoose = require('mongoose');

// ==========================================
// 1. HOMEWORK SCHEMA
// ==========================================

const homeworkSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        maxlength: 50,
    },
    description: {
        type: String,
        maxlength: 250,
    },
    dueDate: {
        type: Date,
    },
    assignedTeacherId: {
        type: String,
        required: true
    },
    students: [
        {
            studentId: String,
            completed: { type: Boolean, default: false }
        },
    ],
    duration: {
        type: Number,
        min: 0,
        max: 999,
    },
    attachment: {
        url: String,
        fileName: String
    },
    schoolId: {
        type: String,
        required: true
    },
    attempts: {
        type: Number,
        min: 0,
        max: 999,
        default: 0
    }
}, {
    timestamps: true
});

// ==========================================
// 2. HOMEWORK COMMENT SCHEMA
// ==========================================

const homeworkCommentSchema = mongoose.Schema({
    homeworkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Homework',
        required: true
    },
    teacherId: {
        type: String,
    },
    studentId: {
        type: String,
    },
    duration: {
        type: Number,
    },
    commentType: {
        type: String,
        enum: ['feedback', 'submission'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    attachment: {
        url: String,
        fileName: String
    },
    pass: {
        type: Boolean,
    }
}, {
    timestamps: true
});

// Index to keep comment queries lightning fast for any specific homework item
homeworkCommentSchema.index({ homeworkId: 1, createdAt: -1 });

// ==========================================
// MODELS & EXPORTS
// ==========================================
const homeworkModel = mongoose.model('homeworkModel', homeworkSchema);
const homeworkCommentModel = mongoose.model('homeworkCommentModel', homeworkCommentSchema);

module.exports = {
    homeworkModel,
    homeworkCommentModel,
    homeworkSchema,
    homeworkCommentSchema
};