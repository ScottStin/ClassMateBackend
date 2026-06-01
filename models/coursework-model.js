const mongoose = require('mongoose');
const MAX_QUESTIONS = 100;

// ==========================================
// PRIMARY COURSEWORK SCHEMA
// ==========================================

const courseworkSchema = new mongoose.Schema({
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
        maxlength: 500,
    },
    courseCoverPhoto:{
        url:String,
        fileName:String
    },
    questions: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'questionModel' 
    }],
    casualPrice:{ 
        type: Number,
        default: 0, 
        min: 0, 
        max: 1000,
    },
    estimatedMinutesToComplete:{ 
        type: Number,
        default: 60, 
        min: 0, 
        max: 100000,
    },
    schoolId:{
        type: String,
        required: true,
    },
}, {
    timestamps: true
})

courseworkSchema.path('questions').validate(function(value) {
  return value.length <= MAX_QUESTIONS;
}, `You can only have up to ${MAX_QUESTIONS} questions.`);

// ==========================================
// PAGE ELEMENT SCHEMA
// ==========================================

const courseworkPageElementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  x: {
    type: Number,
    required: true,
  },
  y: {
    type: Number,
    required: true,
  },
  width: {
    type: Number,
    required: true,
  },
  height: {
    type: Number,
    required: true,
  },
  innerHtmlText: {
    type: String,
    required: false,
  },
  src: {
    type: String,
    required: false,
  },
  elementStyles: {
    backgroundColor: {
      type: String,
      required: false,
    },
    backgroundTransparency: {
      type: Number,
      required: false,
    },
    borderColor: {
      type: String,
      required: false,
    },
    hideBorder: {
      type: Boolean,
      required: false,
    },
  },
}, {
  timestamps: true,
});

// ==========================================
// RELATIONAL SCHEMAS (Anti-Infinite Arrays)
// ==========================================

// Enrollment Schema
const courseworkEnrollmentSchema = new mongoose.Schema({
    courseworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'courseworkModel', required: true, index: true },
    studentId: { type: String, required: true, index: true }
}, { timestamps: true });

// Prevent duplicate enrollments
courseworkEnrollmentSchema.index({ courseworkId: 1, studentId: 1 }, { unique: true });

// Completion Schema
const courseworkCompletionSchema = new mongoose.Schema({
    courseworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'courseworkModel', required: true, index: true },
    studentId: { type: String, required: true, index: true },
    dateCompleted: { type: Date, default: Date.now }
}, { timestamps: true });

// Prevent duplicate completion records
courseworkCompletionSchema.index({ courseworkId: 1, studentId: 1 }, { unique: true });

const courseworkModel = mongoose.model('courseworkModel', courseworkSchema);
const courseworkInfoPageModel = mongoose.model('courseworkInfoPageModel', courseworkPageElementSchema);
const courseworkEnrollmentModel = mongoose.model('courseworkEnrollmentModel', courseworkEnrollmentSchema);
const courseworkCompletionModel = mongoose.model('courseworkCompletionModel', courseworkCompletionSchema);

module.exports = {
  courseworkModel,
  courseworkInfoPageModel,
  courseworkPageElementSchema,
  courseworkEnrollmentModel,
  courseworkCompletionModel,
};
