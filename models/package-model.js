const mongoose = require('mongoose');

const studentsEnrolledSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }
  },
  { _id: false }
);

const packageCoverPhotoSchema = new mongoose.Schema(
  {
    fileName: { type: String },
    url: { type: String }
  },
  { _id: false }
);

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
  courseIds: { type: [String], default: [] },
  examIds: { type: [String], default: [] },
  classHours: { type: Number, required: true },
  rolloverUnusedClasses: { type: Boolean, required: true, default: false },
  packageCoverPhoto: { type: packageCoverPhotoSchema, default: null },
  studentsEnrolled: { type: [studentsEnrolledSchema], default: [] }
});

module.exports = mongoose.model('packageModel', packageSchema);