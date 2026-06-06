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
// 2. HOMEWORK ENROLLMENT SCHEMA
// ==========================================

const homeworkEnrollmentSchema = mongoose.Schema({
    homeworkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Homework',
        required: true
    },
    studentId: {
        type: String,
        required: true
    },
    completed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

homeworkEnrollmentSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true });
homeworkEnrollmentSchema.index({ studentId: 1 });

// --- THE ENROLLMENT LIMITER ---
homeworkEnrollmentSchema.pre('save', async function (next) {
    if (this.isNew) {
        const currentEnrollments = await this.constructor.countDocuments({ homeworkId: this.homeworkId });
        
        if (currentEnrollments >= 500) {
            return next(new Error('Homework enrollment capacity reached. Maximum 500 students allowed.'));
        }
    }
    next();
});


// ==========================================
// 3. HOMEWORK COMMENT SCHEMA
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
const homeworkEnrollmentModel = mongoose.model('homeworkEnrollmentModel', homeworkEnrollmentSchema);
const homeworkCommentModel = mongoose.model('homeworkCommentModel', homeworkCommentSchema);

module.exports = {
    homeworkModel,
    homeworkEnrollmentModel,
    homeworkCommentModel,
    homeworkSchema,
    homeworkEnrollmentSchema,
    homeworkCommentSchema
};
