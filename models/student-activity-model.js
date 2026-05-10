const mongoose = require('mongoose');

const studentMonthlyActivitySchema = new mongoose.Schema({
  schoolId: { 
    type: mongoose.Schema.Types.ObjectId, 
    index: true, 
    required: true 
  },
  studentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
    month: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 12 
    },
  year: { type: Number, 
    required: true, 
    min: 2026 
    },
  
  firstSeenAt: { type: Date, default: Date.now }
});

studentMonthlyActivitySchema.index({ schoolId: 1, studentId: 1, month: 1, year: 1 }, { unique: true }); // UNIQUE INDEX: This prevents duplicate records if a student logs in multiple times in one month.

module.exports = mongoose.model('studentMonthlyActivity', studentMonthlyActivitySchema);
