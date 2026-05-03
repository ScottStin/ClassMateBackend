const mongoose = require('mongoose');

const entrySchema = mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'userModel',
        required: true,
        index: true
    },
    schoolId: {
       type: String,
    },
    referenceId: {
       type: String, // the id of the lesson, exam, homework item etc. being used to avoid repeat entries and make editing possible
    },
    activityType: {
        type: String,
        enum: ['class', 'exam', 'homework', 'coursework', 'extra'],
        required: true
    },
    minutes: { 
        type: Number, 
        default: 0 
    },
    date: { 
        type: Date, 
        default: Date.now 
    },
    comment: String // Only used if activityType is 'extra'
}, { 
    timestamps: false 
});

// This ensures no two documents can have the same studentId AND referenceId
entrySchema.index({ studentId: 1, referenceId: 1 }, { unique: true });

module.exports = mongoose.model('StudentEntry', entrySchema);
