const express = require("express");
const router = express.Router();
const fetch = require('node-fetch');
const { getIo } = require('../socket-io'); // Import the getIo function

const lessonModel = require('../models/lesson-model');

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

router.patch('/register/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    const userId = req.body._id;

    if (lesson.studentsEnrolledIds.includes(userId)) {
      return res.status(400).json('User has already registered for this lesson');
    }

    if(lesson.studentsEnrolledIds.length >= lesson.maxStudents) {
      return res.status(400).json('Max students in lesson already reached');
    }

    lesson.studentsEnrolledIds.push(userId);
    await lesson.save();

    res.json(`Student added to: ${lesson}`);

    // Emit event to all connected clients after lesson is updated
    if(lesson.schoolId) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      io.emit('lessonEvent-' +  lesson.schoolId, {action: 'lessonUpdated', data: lesson});
      // io.emit('lessonUpdated-' + lesson.schoolId, lesson);
    }
  } catch (error) {
    console.error("Error join lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/register-multi/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    // Remove students not in req.body from lesson.studentsEnrolledIds
    lesson.studentsEnrolledIds = lesson.studentsEnrolledIds.filter(
      (id) => req.body.some((student) => student._id === id)
    );

    // Add new students to lesson.studentsEnrolledIds
    for (const student of req.body) {
      userId = student._id
      if (!lesson.studentsEnrolledIds.includes(userId) && lesson.studentsEnrolledIds.length < lesson.maxStudents) {
        lesson.studentsEnrolledIds.push(userId);
      }
    }

    await lesson.save();

    res.json(`Students added to: ${lesson}`);

    // Emit event to all connected clients after lesson is updated
    if(lesson.schoolId) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      io.emit('lessonEvent-' +  lesson.schoolId, {action: 'lessonUpdated', data: lesson});
      // io.emit('lessonUpdated-' + lesson.schoolId, lesson);
    }
  } catch (error) {
    console.error("Error join lessons:", error);
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
    const start = new Date(year, month - 1, day, hour, minute);
    
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
      // io.emit('lessonUpdated-' + lesson.schoolId, lesson);
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

    if (!lesson.studentsEnrolledIds.includes(userId)) {
      return res.status(400).json('User is not currently enrolled in this lesson');
    }
    index = lesson.studentsEnrolledIds.indexOf(userId);
    if (index > -1) {
      lesson.studentsEnrolledIds.splice(index, 1);
    }
    await lesson.save();

    res.json(`Student removed from: ${lesson}`);

    // Emit event to all connected clients after lesson is updated
    if(lesson.schoolId) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      // io.emit('lessonUpdated-' + lesson.schoolId, lesson);
      io.emit('lessonEvent-' +  lesson.schoolId, {action: 'lessonUpdated', data: lesson});
    }

  } catch (error) {
    console.error("Error leaving lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedLesson = await lessonModel.findByIdAndDelete(req.params.id);
    if (deletedLesson) {
      res.status(200).json(deletedLesson);

      // Emit event to all connected clients after lesson is deleted
      const io = getIo();
      // io.emit('lessonDeleted-' + deletedLesson.schoolId, deletedLesson);
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
