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
