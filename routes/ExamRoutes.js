const express = require("express");
const router = express.Router();

const examModel = require('../models/exam-model');
const questionModel = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');

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

router.post('/new', async (req, res) => {
  try {
    // --- prevent user from having more than 100 exams at a time:
    const examCount = await examModel.countDocuments({ schoolId: req.body.examData.schoolId });
    if (examCount > 100) {
      return res.status(400).json({ 
        message: `You can only create up to 100 exams.` 
      });
    }

    // --- create exam:
    const createdExam = await examModel.create(req.body.examData);

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
      if (questionData.prompt3?.fileString && questionData.prompt3?.type) {
        questionData.prompt3.fileString = await saveExamQuestionPrompt(questionData.prompt3.fileString, questionData.prompt3?.type, req.body.examData.schoolId, createdExam._id)
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
            examId: createdExam._id, // Add examId to sub question
          };

          // --- Upload sub-question prompts if they exist:
          if (subQuestionData.prompt1?.fileString && subQuestionData.prompt1?.type) {
            subQuestionData.prompt1.fileString = await saveExamQuestionPrompt(
              subQuestionData.prompt1.fileString,
              subQuestionData.prompt1.type,
              req.body.examData.schoolId,
              createdExam._id
            );
          }

          if (subQuestionData.prompt2?.fileString && subQuestionData.prompt2?.type) {
            subQuestionData.prompt2.fileString = await saveExamQuestionPrompt(
              subQuestionData.prompt2.fileString,
              subQuestionData.prompt2.type,
              req.body.examData.schoolId,
              createdExam._id
            );
          }

          if (subQuestionData.prompt3?.fileString && subQuestionData.prompt3?.type) {
            subQuestionData.prompt3.fileString = await saveExamQuestionPrompt(
              subQuestionData.prompt3.fileString,
              subQuestionData.prompt3.type,
              req.body.examData.schoolId,
              createdExam._id
            );
          }

          const createdSubQuestion = await questionModel.create(subQuestionData);
          createdQuestion.subQuestions.push(createdSubQuestion.id);
          await createdQuestion.save();
        }
      }
      questionIds.push(createdQuestion.id);
    }
    createdExam.questions = questionIds;

    // --- upload photo to cloudinary:
    if(createdExam.examCoverPhoto) {
      await cloudinary.uploader.upload(createdExam.examCoverPhoto.url, {folder: `${req.body.examData.schoolId}/exam-prompts/${createdExam._id}/cover-photo`}, async (err, result)=>{
        if (err) return console.log(err);  
        createdExam.examCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await createdExam.save();

    // Check if the new exam is set as default, and if so, change all other defaults to false.
    if (createdExam.default) {
      await examModel.updateMany({ default: true, _id: { $ne: createdExam._id } }, { $set: { default: false } });
    }
    res.status(201).json(createdExam);

    // Emit event to all student's in school
    if(createdExam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + createdExam.schoolId, {action: 'examCreated', data: createdExam});
    }
  } catch (error) {
    console.error("Error creating new exam or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Save image/audio for exam question prompt to cloudinary
 */

async function saveExamQuestionPrompt(base64ExamPrompt, promptType, schoolId, examId) {
    const maxFileSizeMb = 10; // 10MB
    const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

    // --- Estimate the Base64 file size before uploading - TODO - move to service
    const sizeInBytes = Buffer.byteLength(base64ExamPrompt, 'base64');
    if (sizeInBytes > maxFileSizeBytes) {
        throw new Error(`File too large. Max allowed size is ${maxFileSizeMb} MB.`);
    }

    const result = await cloudinary.uploader.upload(base64ExamPrompt, {
        folder: `${schoolId}/exam-prompts/${examId}`,
        resource_type: promptType === 'audio' ? 'video' : 'image' // Specify 'video' for audio files. Otherwise, upload an image
    }); // todo - move to service
  
  return result.secure_url;
}

router.patch('/register/:id', async (req, res) => {
  try {
    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const userId = req.body._id;

    if (exam.studentsEnrolled.includes(userId)) {
      return res.status(400).json('User has already signed up for this exam');
    }

    exam.studentsEnrolled.push(userId);
    await exam.save();

    res.json(`Student added to: ${exam}`);

    if(exam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
    }
  } catch (error) {
    console.error("Error joining exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/reset-student-exam/:id', async (req, res) => {
  try {

    const exam = await examModel.findById(req.params.id);
    if (!exam) {
      return res.status(404).json('Exam not found');
    }
  
    let questions = await questionModel.find({examId: exam._id})
    if (!questions || questions.length === 0) {
      return res.status(404).json('Questions not found');
    }

    const studentId = req.body.studentId;
    if (!studentId) {
      return res.status(404).json('Student not found');
    }

    const schoolId = exam.schoolId;
    if (!schoolId) {
      return res.status(404).json('School not found');
    }

    for (const question of questions) {
      if(!question.studentResponse || question.studentResponse.length === 0) {
        continue;
      }

      const studentResponse = question.studentResponse.find(
        (response) => response.studentId.toString() === studentId.toString()
      )

      if(!studentResponse) {
        continue;
      }

      question.studentResponse = question.studentResponse.filter(
        (response) => response.studentId.toString() !== studentId.toString()
      );
      await question.save();

      if(!['audio-response', 'repeat-sentence', 'read-outloud'].includes(question.type)) {
        continue;
      }

      const fileName = studentResponse.response.split("/").pop().split(".")[0];
      const cloudinaryFilePath = `${schoolId}/exam-question-responses/${exam._id}/${fileName}`;

      try {
        const cloudinaryFilePath = `${schoolId}/exam-question-responses/${exam._id}/${fileName}`;

        console.log('Deleting from Cloudinary:', cloudinaryFilePath);

        const result = await cloudinary.uploader.destroy(cloudinaryFilePath, {
          resource_type: 'video', // REQUIRED for audio/video uploads
          invalidate: true        // optional: clears cached versions
        });

        console.log('Cloudinary destroy result:', result);
      } catch (err) {
        console.error('Error deleting student response:', err);
      }
    }
  
    exam.studentsCompleted = exam.studentsCompleted.filter((student) => student.studentId !== studentId)
    await exam.save();

    res.json(`Student exam questions reset: ${exam._id}`);

    if(exam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
    }
  } catch (error) {
    console.error("Error resetting student's exam exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/enrol-students/:id', async (req, res) => {
  try {
    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const studentIds = req.body.studentIds;

    for(const studentId of studentIds) {
      if (exam.studentsEnrolled.includes(studentId)) {
        // res.status(400).json('User has already signed up for this exam');
        continue
      }
      exam.studentsEnrolled.push(studentId);
    }
    await exam.save();
    res.json(exam);


    if(exam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
    }
  } catch (error) {
    console.error("Error joining exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const examId  = req.params.id
    const exam = await examModel.findById(examId);

    if(!exam) {
      res.status(404).json({ message: "Exam not found" });
      return;
    }

    if(exam.default) {
      res.status(404).json({ message: "Cannot delete default exam" });
      return;
    }

    const deletedExam = await examModel.findByIdAndDelete(examId);

    if (!deletedExam) {
      res.status(404).json({ message: "Exam not found" });
    }

    // Delete question
    await questionModel.deleteMany({ examId });

    // Delete exam prompts:
    const schoolId = deletedExam.schoolId;
    const folderPathPrompts = `${schoolId}/exam-prompts/${examId}`;
    const { resources: promptFolder } = await cloudinary.api.resources({
      type: "upload",
      prefix: folderPathPrompts,
      max_results: 1
    });
    if(promptFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathPrompts);
      await cloudinary.api.delete_folder(folderPathPrompts);
    }

    // Delete exam responses:
    const folderPathResponses = `${schoolId}/exam-question-responses/${examId}`;
    const { resources: responseFolder }  = await cloudinary.api.resources({
      type: "upload",
      prefix: folderPathResponses,
      max_results: 1
    });
    if(responseFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathResponses);
      await cloudinary.api.delete_folder(folderPathResponses);
    }

    res.status(200).json(deletedExam);

    // Emit event to all student's in school
    if(deletedExam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + deletedExam.schoolId, {action: 'examDeleted', data: deletedExam});
    }
  } catch (error) {
    console.error("Error deleting exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
