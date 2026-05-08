const express = require("express");
const router = express.Router();
const fetch = require('node-fetch');
const { getIo } = require('../socket-io');

const lessonModel = require('../models/lesson-model');
const userModel = require('../models/user-models');

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;

        // If currentSchoolId is provided, filter lessons by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        // Find lessons based on the filter
        const lessons = await lessonModel.find(filter);

        // Send the filtered lessons as the response
        res.json(lessons);
    } catch (error) {
        console.error("Error getting lessons:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    console.log(req.body);
    const createdLessons = await lessonModel.insertMany(req.body);
    res.status(201).json(createdLessons);
  
    // Emit event to all connected clients after lesson is created
    if(req.body[0].schoolId) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      // io.emit('lessonCreated-' + req.body[0].schoolId, createdLessons);
      io.emit('lessonEvent-' +  req.body[0].schoolId, {action: 'lessonCreated', data: createdLessons});
    }
  } catch (error) {
    console.error("Error creating new lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/update/:id', async (req, res) => {
  try {
    console.log(req.body);
    const lesson = await lessonModel.findById(req.params.id);
  
    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }
    Object.assign(lesson, req.body);

    const updatedLesson = await lesson.save();

    res.status(200).json(updatedLesson);

    // emit socket event for update:
    const io = getIo(); // Safely get the initialized Socket.IO instance
    io.emit('lessonEvent-' +  updatedLesson.schoolId, {action: 'lessonUpdated', data: updatedLesson});

  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/register/:id', async (req, res) => {
  try {
    const { userId, enrolmentMethod } = req.body;
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    // --- Check if user is already in the studentsEnrolled array of objects
    const isAlreadyEnrolled = lesson.studentsEnrolled.some(
      (enrollment) => enrollment.studentId === userId
    );

    if (isAlreadyEnrolled) {
      return res.status(400).json('User has already registered for this lesson');
    }

    // --- Check capacity
    if (lesson.studentsEnrolled.length >= lesson.maxStudents) {
      return res.status(400).json('Max students in lesson already reached');
    }

    // --- Push the new object structure
    lesson.studentsEnrolled.push({
      studentId: userId,
      enrolmentMethod: enrolmentMethod || 'casual'
    });

    await lesson.save();

    // --- Emit event to all connected clients
    const io = getIo();
    if (lesson.schoolId) {
      io.emit('lessonEvent-' + lesson.schoolId, { action: 'lessonUpdated', data: lesson });
    }

    // --- Update class hours in user model:
    if(enrolmentMethod === 'casual' || !enrolmentMethod) {
      return res.json(lesson);
    }

    const student = await userModel.findById(userId);

    if (!student) {
      return res.status(404).send("Student not found");
    }

    const duration = Math.round(lesson.duration / 60) || 0;

    if (enrolmentMethod === 'subscription-package') {
      student.subscriptionClassHours = Math.max(0, (student.subscriptionClassHours || 0) - duration);
    } 

    else if (enrolmentMethod === 'one-time-payment-package') {
      if(duration >= student.bulkPaymentClassHours) {
        student.bulkPaymentClassHours = 0
      } else {
        student.bulkPaymentClassHours = Math.max(0, (student.bulkPaymentClassHours || 0) - duration);
      }
      
    } 

    else if (enrolmentMethod === 'combo') {
      let remainingDuration = duration;

      // Subtract from subscription first
      const subHours = student.subscriptionClassHours || 0;
      const subToSubtract = Math.min(subHours, remainingDuration);
      
      student.subscriptionClassHours = subHours - subToSubtract;
      remainingDuration -= subToSubtract;

      // Subtract remaining from bulk payments
      if (remainingDuration > 0) {
        const bulkHours = student.bulkPaymentClassHours || 0;
        const bulkToSubtract = Math.min(bulkHours, remainingDuration);
        
        student.bulkPaymentClassHours = bulkHours - bulkToSubtract;
        remainingDuration -= bulkToSubtract;
      }
      
      // Note: remainingDuration > 0 at this point means the student 
      // actually didn't have enough total hours for the lesson.
    }

    await student.save();

    if (student) {
      io.emit('authStoreEvent-' + student._id, { action: 'currentUserUpdated', data: student });
    }

    res.json(lesson);

  } catch (error) {
    console.error("Error joining lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/register-multi/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    // Remove students from the lesson who are not in the incoming request body
    lesson.studentsEnrolled = lesson.studentsEnrolled.filter((enrolment) =>
      req.body.some((student) => student._id === enrolment.studentId)
    );

    //  Add: Iterate through the request body to add new students
    for (const student of req.body) {
      const userId = student._id;
      const method = student.enrolmentMethod || 'casual';

      // Check if they are already in the array
      const isAlreadyEnrolled = lesson.studentsEnrolled.some(
        (e) => e.studentId === userId
      );

      // Add if not present and capacity allows
      if (!isAlreadyEnrolled && lesson.studentsEnrolled.length < lesson.maxStudents) {
        lesson.studentsEnrolled.push({
          studentId: userId,
          enrolmentMethod: method
        });
      }
    }

    await lesson.save();

    // Emit event
    if (lesson.schoolId) {
      const io = getIo();
      io.emit('lessonEvent-' + lesson.schoolId, { 
        action: 'lessonUpdated', 
        data: lesson 
      });
    }

    res.json(`Students updated for lesson: ${lesson.name}`);

  } catch (error) {
    console.error("Error in multi-registration:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/start-lesson/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }
    const { startTime, duration } = req.body; // Extract startTime and duration from request body

    // Manually parse the startTime without adjusting for time zone
    const [datePart, timePart] = startTime.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    // Create a Date object using the local time components (this avoids timezone adjustments)
    // const start = new Date(year, month - 1, day, hour, minute);
    const start = new Date(startTime);
    
    // Calculate not_before and expires_at
    const notBefore = new Date(start.getTime() - (5 * 60000)); // 5 min before lesson starts
    const expiresAt = new Date(start.getTime() + (duration * 60000) + (15 * 60000)); // Duration + 15 min after lesson ends

    // Room properties for the lesson
    const roomProperties = {
      enable_chat: true,
      max_participants: 10,
      enable_breakout_rooms: true,
      enable_screenshare: true,
      enable_people_ui: true,
      nbf: Math.floor(notBefore.getTime() / 1000), // Convert to seconds
      exp: Math.floor(expiresAt.getTime() / 1000), // Convert to seconds
    };

    // Create the room in Daily.co
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer 122fa2723fc0ca4355d9f10795f52462d285fcb15c5ef20160f3b04ff8b9a726` // Replace with your actual API key
      },
      body: JSON.stringify({
        name: req.body._id,
        properties: roomProperties,
      })
    });

    // Handle the response
    const roomData = await roomResponse.json();


    if (!roomResponse.ok) {
      console.log(roomData);
      throw new Error('Failed to create room: ' + roomData.message);
    }

    // Start lesson
    lesson.status = 'started';
    await lesson.save();
    res.json(`Lesson started`);

    // Emit event to all connected clients after lesson is updated
    if(lesson.schoolId) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      io.emit('lessonEvent-' +  lesson.schoolId, {action: 'lessonUpdated', data: lesson});
    }
  } catch (error) {
    console.error("Error starting lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/cancel/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    const userId = req.body._id;

    // Check if the user is actually in the enrolled array
    const enrollment = lesson.studentsEnrolled.find((student) => student.studentId === userId);
    if (!enrollment) {
      return res.status(400).json('User is not currently enrolled in this lesson');
    }
  
    // Remove the student by filtering out their ID // This creates a new array excluding the matching studentId
    lesson.studentsEnrolled = lesson.studentsEnrolled.filter(
      (enrolment) => enrolment.studentId !== userId
    );

    await lesson.save();

    // Emit event to all connected clients
    const io = getIo();
    if (lesson.schoolId) {
      io.emit('lessonEvent-' + lesson.schoolId, {
        action: 'lessonUpdated', 
        data: lesson
      });
    }

    // Refund the students time if needed:
    const enrolmentMethod = enrollment.enrolmentMethod;
    if(enrolmentMethod === 'casual' || !enrolmentMethod || lesson.duration === 0 || !lesson.duration) {
      return res.json(lesson);
    }

    const student = await userModel.findById(userId);

    if (enrolmentMethod === 'subscription-package') {
      student.subscriptionClassHours = (student.subscriptionClassHours + (lesson.duration / 60));
    }

    if (enrolmentMethod === 'one-time-payment-package' || enrolmentMethod === 'combo') {
      student.bulkPaymentClassHours = (student.bulkPaymentClassHours + (lesson.duration / 60));
    }

    await student.save();

    if (student) {
      io.emit('authStoreEvent-' + student._id, { action: 'currentUserUpdated', data: student });
    }

    res.json(`Student removed from: ${lesson.name}`);

  } catch (error) {
    console.error("Error leaving lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/bulk-delete', async (req, res) => {
  try {
    const lessonIds = req.body;

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return res.status(400).json({ message: 'No lessons provided' });
    }

    // Find lessons first so we can return + emit them
    const lessonsToDelete = await lessonModel.find({ _id: { $in: lessonIds } });

    if (lessonsToDelete.length === 0) {
      return res.status(404).json({ message: 'No lessons found' });
    }

    await lessonModel.deleteMany({ _id: { $in: lessonIds } });

    res.status(200).json(lessonsToDelete);

    // Emit socket events
    const io = getIo();
    lessonsToDelete.forEach(lesson => {
      io.emit(
        'lessonEvent-' + lesson.schoolId,
        { action: 'lessonDeleted', data: lesson }
      );
    });

  } catch (error) {
    console.error('Error bulk deleting lessons:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedLesson = await lessonModel.findByIdAndDelete(req.params.id);
    if (deletedLesson) {
      res.status(200).json(deletedLesson);

      // Emit event to all connected clients after lesson is deleted
      const io = getIo();
      io.emit('lessonEvent-' +  deletedLesson.schoolId, {action: 'lessonDeleted', data: deletedLesson});
    } else {
      res.status(404).json({ message: "Lesson not found" });
    }
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
