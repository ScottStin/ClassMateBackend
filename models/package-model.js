const mongoose = require('mongoose');

function limitTo100(val) {
    return val.length <= 100;
}

// ==========================================
// PACKAGE ENROLMENT SCHEMA (Standalone Collection)
// ==========================================

const studentsEnrolledInPackageSchema = new mongoose.Schema(
  {
    packageId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'packageModel', 
        required: true 
    },
    studentId: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }
  },
  { timestamps: true }
);

studentsEnrolledInPackageSchema.index({ packageId: 1, studentId: 1, startDate: 1 }, { unique: true });

// ==========================================
// COVER PHOTO SCHEMA
// ==========================================

const packageCoverPhotoSchema = new mongoose.Schema(
  {
    fileName: { type: String },
    url: { type: String }
  },
  { _id: false }
);

// ==========================================
// MAIN PACKAGE SCHEMA
// ==========================================

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  schoolId: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['subscription', 'one-time-payment']
  },
  price: { type: Number, required: true },
  subscriptionFrequency: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly', null],
    default: null
  },
  paymentLength: { type: Number, default: null },

  courseIds: { 
    type: [String], 
    default: [],
    validate: [limitTo100, '{PATH} exceeds the limit of 100 courses.']
  },
  examIds: { 
    type: [String], 
    default: [],
    validate: [limitTo100, '{PATH} exceeds the limit of 100 exams.']
  },

  classHours: { type: Number, required: true },
  rolloverUnusedClasses: { type: Boolean, required: true, default: false },
  packageCoverPhoto: { type: packageCoverPhotoSchema, default: null },

  // studentsEnrolled: { type: [studentsEnrolledSchema], default: [] }, // removed and replaced with standalone collection for better performance and scalability

  stripeProductId: { type: String, default: null },
  stripePriceId: { type: String, default: null },
  stripeCurrency: { type: String, default: "usd" },
});

// ==========================================
// COMPILE AND EXPORT MODELS
// ==========================================

const packageModel = mongoose.model('packageModel', packageSchema);
const packageEnrolmentModel = mongoose.model('packageEnrolmentModel', studentsEnrolledInPackageSchema);

module.exports = {
    packageModel,
    packageEnrolmentModel
};

module.exports = {
    packageModel,
    packageEnrolmentModel
};