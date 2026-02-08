const express = require("express");
const router = express.Router();

const examModel = require('../models/exam-model');
const questionModel = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');
const { createQuestion, deleteQuestion } = require('./QuestionRoutes');

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
      const createdQuestion = await createQuestion(question, createdExam._id, req.body.schoolId);
      questionIds.push(createdQuestion.questionId.toString());
     }
    createdExam.questions = questionIds;

    // --- upload photo to cloudinary:
    if(createdExam.examCoverPhoto?.url) {
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

router.patch('/update-exam/:id', async (req, res) => {
  try {
    const examData = req.body.examData;
    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const { examCoverPhoto, ...examDataWithoutPhoto } = examData;

    Object.assign(exam, examDataWithoutPhoto);

    // --- upload photo to cloudinary:
    if(examData.examCoverPhoto?.url) {
      // Delete old cover photo: (todo - move to file service)
      const schoolId = examData.schoolId;
      const folderPathCoverPhoto = `${schoolId}/exam-prompts/${req.params.id}/cover-photo`;
      const { resources: coverPhotoFolder } = await cloudinary.api.resources({
        type: "upload",
        prefix: folderPathCoverPhoto,
        max_results: 1
      });

      if(coverPhotoFolder?.length > 0) {
        await cloudinary.api.delete_resources_by_prefix(folderPathCoverPhoto);
        await cloudinary.api.delete_folder(folderPathCoverPhoto);
      }
    
      // upload new cover photo:
      await cloudinary.uploader.upload(examData.examCoverPhoto.url, {folder: `${examData.schoolId}/exam-prompts/${exam._id}/cover-photo`}, async (err, result)=>{
        if (err) return console.log(err);  
        exam.examCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await exam.save();
 
    // ---------------- NORMALIZE ----------------
    const getQid = q => (q._id || q.questionId || q).toString();

    const incoming = req.body.questions || [];
    const incomingIds = incoming.map(getQid);

    // const existing = exam.questions || [];
    // const existingIds = existing.map(getQid);

    const dbQuestions = await questionModel.find(
      { examId: exam._id },
      { _id: 1 }
    );

    const dbIds = dbQuestions.map(q => q._id.toString());

    // ---------------- DIFF ----------------
    const idsToDelete = dbIds.filter(id => !incomingIds.includes(id));
    const idsToAdd    = incomingIds.filter(id => !dbIds.includes(id));
    const idsToUpdate = incomingIds.filter(id => dbIds.includes(id));

    // ---------------- DELETE ----------------
    if (idsToDelete.length) {
      const deleteDocs = await questionModel.find({
        _id: { $in: idsToDelete }
      });

      for (const q of deleteDocs) {
        await deleteQuestion(q, exam._id, exam.schoolId);
      }
    }

    // ---------------- UPDATE ----------------
    for (const q of incoming.filter(q => idsToUpdate.includes(getQid(q)))) {
      const doc = await questionModel.findById(getQid(q));
      if (doc) {
        doc.name = q.name;
        await doc.save();
      }
    }

    // ---------------- ADD ----------------
    for (const q of incoming.filter(q => idsToAdd.includes(getQid(q)))) {
      const sanitized = { ...q };
      delete sanitized._id;

      const created = await createQuestion(
        sanitized,
        exam._id,
        exam.schoolId
      );

      console.log(created);
      exam.questions.push((created._id ?? created.questionId).toString());
    }

    // ---------------- REBUILD EXAM QUESTIONS ----------------
    const finalQuestions = await questionModel.find(
      { examId: exam._id },
      { _id: 1 }
    );

    exam.questions = finalQuestions.map(q => q._id.toString());

    await exam.save();
  
    // await questionModel.deleteMany({
    //   examId: exam._id,
    //   _id: { $nin: incomingIds.filter((id) => typeof id === 'string' && id !== '[object Object]') }
    // });

    res.json(`Exam updated: ${exam._id}`);

    if(exam?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
    }
  } catch (error) {
    console.error("Error updating exam:", error);
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

router.patch('/un-enrol-student-from-exam/:id', async (req, res) => {
  try {
    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const studentId = req.body.studentId;

    if (!exam.studentsEnrolled.includes(studentId)) {
      res.status(400).json('User is not currently enrolled in this exam');
      return;
    }

    if(exam.studentsCompleted.map(
        (studentCompleted) => studentCompleted.studentId
      ).includes(studentId)) {
        res.status(400).json('User has already completed the exam and therefore cannot be removed');
        return;
      }
  
      exam.studentsEnrolled = exam.studentsEnrolled.filter(
        (s) => s !== studentId
      );
    
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

    // Delete  cover photo: (todo - move to file service)
    const folderPathCoverPhoto = `${schoolId}/exam-prompts/${req.params.id}/cover-photo`;
    const { resources: coverPhotoFolder } = await cloudinary.api.resources({
      type: "upload",
      prefix: folderPathCoverPhoto,
      max_results: 1
    });

    if(coverPhotoFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathCoverPhoto);
      await cloudinary.api.delete_folder(folderPathCoverPhoto);
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

module.exports = {
  router,
  saveExamQuestionPrompt
};
