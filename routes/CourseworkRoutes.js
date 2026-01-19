const express = require("express");
const router = express.Router();

const { courseworkModel } = require('../models/coursework-model');
const questionModel = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');
const examRoutes = require('./ExamRoutes');

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;
      
        // If currentSchoolId is provided, filter course by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        await courseworkModel.find(filter)
        .then(courses => {res.json(courses)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting courses:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    // --- prevent user from having more than 100 courses at a time:
    const courseCount = await courseworkModel.countDocuments({ schoolId: req.body.courseData.schoolId });
    if (courseCount > 100) {
      return res.status(400).json({ 
        message: `You can only create up to 100 courses.` 
      });
    }

    // --- create course:
    const createdCourse = await courseworkModel.create(req.body.courseData);

    const questionIds = [];
    for (let question of req.body.questions) {
      const { subQuestions, id, ...questionData } = question;

      // Add courseworkId of newly created course to questionData:
      questionData.examId = createdCourse._id; // note - we're using examId for courses as well, not just exams

    //   // --- upload prompt to cloudinary and add to question (if prompt exists):
      if (questionData.prompt1?.fileString && questionData.prompt1?.type) {
        questionData.prompt1.fileString = await examRoutes.saveExamQuestionPrompt(questionData.prompt1.fileString, questionData.prompt1?.type, req.body.examData.schoolId, createdExam._id)
      }
      if (questionData.prompt2?.fileString && questionData.prompt2?.type) {
        questionData.prompt2.fileString = await examRoutes.saveExamQuestionPrompt(questionData.prompt2.fileString, questionData.prompt2?.type, req.body.examData.schoolId, createdExam._id)
      }
      if (questionData.prompt3?.fileString && questionData.prompt3?.type) {
        questionData.prompt3.fileString = await examRoutes.saveExamQuestionPrompt(questionData.prompt3.fileString, questionData.prompt3?.type, req.body.examData.schoolId, createdExam._id)
      }
  
      // --- Create parent question:
      const createdQuestion = await questionModel.create(questionData);

      // --- check if question has sub questions, and if so, save them:
      if (subQuestions?.length > 0) {
        for (let subQuestion of subQuestions) {
          const { id, ...questionWithoutId } = subQuestion;
          const subQuestionData = {
            ...questionWithoutId,
            parent: createdQuestion.id,
            examId: createdCourse._id, // Add examId (coursework id) to sub question
          };

        //   // --- Upload sub-question prompts if they exist:
          if (subQuestionData.prompt1?.fileString && subQuestionData.prompt1?.type) {
            subQuestionData.prompt1.fileString = await examRoutes.saveExamQuestionPrompt(
              subQuestionData.prompt1.fileString,
              subQuestionData.prompt1.type,
              req.body.courseData.schoolId,
              createdCourse._id
            );
          }

          if (subQuestionData.prompt2?.fileString && subQuestionData.prompt2?.type) {
            subQuestionData.prompt2.fileString = await examRoutes.saveExamQuestionPrompt(
              subQuestionData.prompt2.fileString,
              subQuestionData.prompt2.type,
              req.body.courseData.schoolId,
              createdCourse._id
            );
          }

          if (subQuestionData.prompt3?.fileString && subQuestionData.prompt3?.type) {
            subQuestionData.prompt3.fileString = await examRoutes.saveExamQuestionPrompt(
              subQuestionData.prompt3.fileString,
              subQuestionData.prompt3.type,
              req.body.courseData.schoolId,
              createdCourse._id
            );
          }

          const createdSubQuestion = await questionModel.create(subQuestionData);
          createdQuestion.subQuestions.push(createdSubQuestion.id);
          await createdQuestion.save();
        }
      }
      questionIds.push({questionId: createdQuestion.id, studentsCompleted: []});
    }
    createdCourse.questions = questionIds;

    // --- upload photo to cloudinary:
    if(createdCourse.courseCoverPhoto?.url) {
      await cloudinary.uploader.upload(createdCourse.courseCoverPhoto.url, {folder: `${req.body.courseData.schoolId}/exam-prompts/${createdCourse._id}/cover-photo`}, async (err, result)=>{
        if (err) return console.log(err);  
        createdCourse.courseCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await createdCourse.save();

    res.status(201).json(createdCourse);

    // Emit event to all student's in school
    if(createdCourse?.schoolId) {
      const io = getIo();
      io.emit('courseworkEvent-' + createdCourse.schoolId, {action: 'courseCreated', data: createdCourse});
    }
  } catch (error) {
    console.error("Error creating new course or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
