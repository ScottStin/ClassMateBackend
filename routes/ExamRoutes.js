const express = require("express");
const router = express.Router();

const examModel = require('../models/exam-model');
const questionModel = require("../models/question-model");

router.get('/', async function (req, res) {
    try {
        await examModel.find()
        .then(exams => {res.json(exams)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting exams:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    const createdExam = await examModel.create(req.body.exam);
    console.log(createdExam);
    const questionIds = [];
    for (let question of req.body.questions) {
      const { subQuestions, id, ...questionData } = question;    
      const createdQuestion = await questionModel.create(questionData);
      if (subQuestions?.length > 0) {
        for (let question of subQuestions) {
          const { id, ...questionWithoutId } = question;
          const questionData = {
            ...questionWithoutId,
            parent: createdQuestion.id,
          };
          const createdSubQuestion = await questionModel.create(questionData);
          createdQuestion.subQuestions.push(createdSubQuestion.id);
          await createdQuestion.save();
        }
      }
      questionIds.push(createdQuestion.id);
    }
    createdExam.questions = questionIds;
    await createdExam.save();
    res.status(201).json(createdExam);
  } catch (error) {
    console.error("Error creating new exam or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/register/:id', async (req, res) => {
  try {
    console.log(req.params.id);
    console.log(req.body.email);

    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const userEmail = req.body.email;

    if (exam.studentsEnrolled.includes(userEmail)) {
      return res.status(400).json('User has already signed up for this exam');
    }

    exam.studentsEnrolled.push(userEmail);
    await exam.save();

    res.json(`Student added to: ${exam}`);
  } catch (error) {
    console.error("Error joining exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
    try {
      const deletedExam = await examModel.findByIdAndDelete(req.params.id);
      console.log(deletedExam);
      if (deletedExam) {
        res.status(200).json(deletedExam);
      } else {
        res.status(404).json({ message: "Exam not found" });
      }
    } catch (error) {
      console.error("Error deleting exam:", error);
      res.status(500).send("Internal Server Error");
    }
  });

module.exports = router;