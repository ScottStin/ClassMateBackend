const express = require("express");
const router = express.Router();

const lessonModel = require('../models/lesson-model');

router.get('/', async function (req, res) {
    try {
        await lessonModel.find()
        .then(lessons => {res.json(lessons)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting lessons:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    const createdLesson = await lessonModel.insertMany(req.body);
    console.log(createdLesson);
    res.status(201).json(createdLesson);
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

    const userEmail = req.body.email;

    if (lesson.studentsEnrolled.includes(userEmail)) {
      return res.status(400).json('User has already registered for this lesson');
    }

    lesson.studentsEnrolled.push(userEmail);
    await lesson.save();

    res.json(`Student added to: ${lesson}`);
  } catch (error) {
    console.error("Error join lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/cancel/:id', async (req, res) => {
  try {
    const lesson = await lessonModel.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json('Lesson not found');
    }

    const userEmail = req.body.email;

    if (!lesson.studentsEnrolled.includes(userEmail)) {
      return res.status(400).json('User is not currently enrolled in this lesson');
    }
    console.log(userEmail);
    console.log(lesson.studentsEnrolled);
    index = lesson.studentsEnrolled.indexOf(userEmail);
    if (index > -1) {
      lesson.studentsEnrolled.splice(index, 1);
    }
    await lesson.save();

    res.json(`Student removed from: ${lesson}`);
  } catch (error) {
    console.error("Error leaving lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedLesson = await lessonModel.findByIdAndDelete(req.params.id);
    console.log(deletedLesson);
    if (deletedLesson) {
      res.status(200).json(deletedLesson);
    } else {
      res.status(404).json({ message: "Lesson not found" });
    }
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
