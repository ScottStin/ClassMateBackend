const express = require("express");
const router = express.Router();

const studentMonthlyActivity = require('../models/student-activity-model');

router.get('/student-activity', async (req, res) => {
  try {
    const { schoolId, month, year } = req.query;

    if (!schoolId || !month || !year) {
      return res.status(400).json({ error: 'schoolId, month, and year are required.' });
    }

    const activities = await studentMonthlyActivity.find({
      schoolId: schoolId,
      month: parseInt(month),
      year: parseInt(year)
    }).select('studentId -_id'); // We get the studentId and exclude the activity's own _id

    res.json(activities);
    
  } catch (error) {
    console.error('Error fetching student activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

/**
 * Internal function to track activity. 
 */

const trackStudentActivity = async (schoolId, studentId) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    // Upsert: Create if doesn't exist, do nothing if it does.
    await studentMonthlyActivity.updateOne(
      { schoolId, studentId, month, year },
      { $setOnInsert: { firstSeenAt: now } },
      { upsert: true }
    );
  } catch (error) {
    // 11000 is a duplicate key error - we ignore it as it means the 
    // student was already marked active by a parallel request.
    if (error.code !== 11000) {
      console.error('Error tracking activity:', error);
    }
  }
};

module.exports = {
  router,
  trackStudentActivity,
};

