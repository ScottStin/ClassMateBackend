const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io');

const StudentEntry = require('../models/student-stats-model');
const UserModel = require('../models/user-models');

router.get('/', async (req, res) => {
  try {
    // 1. Destructure for cleaner code
    const { currentSchoolId, studentId } = req.query;

    // 2. Build filter dynamically
    const filter = {};
    if (currentSchoolId) filter.schoolId = currentSchoolId;
    if (studentId) filter.studentId = studentId;

    // 3. Execute query with sorting
    const stats = await StudentEntry.find(filter).sort({ date: -1 });

    res.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    // We simply call our internal logic function
    const savedEntry = await createStudentStat(req.body);

    // Return the newly created document
    res.status(201).json(savedEntry);
  } catch (error) {
    console.error("Error in POST /stats:", error.message);
    
    // If the error was "Student not found", send 404, otherwise 400
    const statusCode = error.message === "Student not found" ? 404 : 400;
    res.status(statusCode).json({ error: error.message });
  }
});


const createStudentStat = async (data) => {
  const { studentId, activityType, minutes, date, comment, referenceId } = data;

  // 1. Validation
  if (!studentId || !activityType || minutes === undefined) {
    throw new Error("Missing required fields");
  }

  // 2. Fetch user for schoolId
  const user = await UserModel.findById(studentId);
  if (!user) throw new Error("Student not found");

  // 3. Use findOneAndUpdate with the 'upsert' option
  // Filter: Find an entry with this student + reference
  // Update: Set the new values
  const filter = { studentId, referenceId };
  
  // We only set referenceId on insert. We update minutes and other fields.
  const update = {
    activityType,
    minutes,
    comment,
    schoolId: user.schoolId,
    date: date || Date.now()
  };

  // options: 
  // upsert: true (create if doesn't exist)
  // new: true (return the updated document)
  // runValidators: true (ensure enum check still works)
  const newEntry = await StudentEntry.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    runValidators: true
  });

  
  // --- emit socket event:
  if (newEntry) {
    const io = getIo();
    io.emit('statsEvents-' + user.schoolId, {action: 'statsCreated', data: newEntry});
  }

  return newEntry
};

module.exports = {
  router,
  createStudentStat,
};
