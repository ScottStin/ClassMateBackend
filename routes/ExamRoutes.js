const express = require("express");
const router = express.Router();

const examModel = require('../models/exam-model');
const questionModel = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;
      
        // If currentSchoolId is provided, filter exam by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        await examModel.find(filter)
        .then(exams => {res.json(exams)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting exams:", error);
        res.status(500).send("Internal Server Error");
    }
});

// router.patch('/register-default', async (req, res) => {
//   try {
//     const exam = await examModel.findOne({ default: true });
//     if (!exam) {
//       return res.status(404).json('Default exam not found');
//     }

//     const userEmail = req.body.email;

//     if (exam.studentsEnrolled.includes(userEmail)) {
//       return res.status(400).json('User has already signed up for this exam');
//     }

//     exam.studentsEnrolled.push(userEmail);
//     await exam.save();

//     res.json(`Student added to: ${exam}`);
//   } catch (error) {
//     console.error("Error joining default exam:", error);
//     res.status(500).send("Internal Server Error");
//   }
// });

router.post('/new', async (req, res) => {
  try {
    console.log('req.body:');
    console.log(req.body);

    
    const createdExam = await examModel.create(req.body.examData);
    
    console.log('createdExam:');
    console.log(createdExam);
    const questionIds = [];
    for (let question of req.body.questions) {
      const { subQuestions, id, ...questionData } = question;

      // Add examId of newly created exam to questionData:
      questionData.examId = createdExam._id;

      // --- upload prompt to cloudinary and add to question (if prompt exists):
      if (questionData.prompt1?.fileString && questionData.prompt1?.type) {
        questionData.prompt1.fileString = await saveExamQuestionPrompt(questionData.prompt1.fileString, questionData.prompt1?.type, req.body.examData.schoolId, createdExam._id)
      }
      if (questionData.prompt2?.fileString && questionData.prompt2?.type) {
        questionData.prompt2.fileString = await saveExamQuestionPrompt(questionData.prompt2.fileString, questionData.prompt2?.type, req.body.examData.schoolId, createdExam._id)
      }
  
      // --- Create parent question:
      const createdQuestion = await questionModel.create(questionData);

      // --- check if question has sub questions, and if so, save them:
      if (subQuestions?.length > 0) {
        for (let question of subQuestions) {
          const { id, ...questionWithoutId } = question;
          const questionData = {
            ...questionWithoutId,
            parent: createdQuestion.id,
            examId: createdExam._id, // Add examId to sub questio
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

    // Check if the new exam is set as default, and if so, change all other defaults to false.
    if (createdExam.default) {
      await examModel.updateMany({ default: true, _id: { $ne: createdExam._id } }, { $set: { default: false } });
    }
    res.status(201).json(createdExam);
  } catch (error) {
    console.error("Error creating new exam or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Save image/audio for exam question prompt to cloudinary
 */

async function saveExamQuestionPrompt(base64ExamPrompt, promptType, schoolId, examId) {
    const result = await cloudinary.uploader.upload(base64ExamPrompt, {
        folder: `${schoolId}/exam-prompts/${examId}`,
        resource_type: promptType === 'audio' ? 'video' : 'image' // Specify 'video' for audio files. Otherwise, upload an image
    });
  
  return result.secure_url;
}

router.patch('/register/:id', async (req, res) => {
  try {
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