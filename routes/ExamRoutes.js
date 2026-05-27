const express = require("express");
const router = express.Router();

const {examModel, Enrollment, Completion} = require('../models/exam-model');
const { questionModel, questionSubmissionModel } = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');
const {
  deleteCloudinaryFolderIfExists
} = require('../file-helper.js');
const { createQuestion, deleteQuestion } = require('./QuestionRoutes');

router.get('/', async function (req, res) {
    try {
        const currentSchoolId = req.query.currentSchoolId;
        let filter = currentSchoolId ? { schoolId: currentSchoolId } : {};

        // Fetch exams as plain JavaScript objects
        const exams = await examModel.find(filter).lean();

        // Fetch all relevant enrollments and completions for this school
        const examIds = exams.map(e => e._id);
        
        const enrollments = await Enrollment.find({ examId: { $in: examIds } });
        const completions = await Completion.find({ examId: { $in: examIds } });

        // Map the data back into the exam objects
        const result = exams.map(exam => {
            return {
                ...exam,
                // Map Enrollments
                studentsEnrolled: enrollments
                    .filter(e => e.examId.toString() === exam._id.toString())
                    .map(e => e.studentId),
                
                // Map Completions
                studentsCompleted: completions
                    .filter(c => c.examId.toString() === exam._id.toString())
                    .map(c => ({ studentId: c.studentId, mark: c.mark })),
                
                // Map AI Completion status
                aiMarkingComplete: completions
                    .filter(c => c.examId.toString() === exam._id.toString() && c.aiMarked)
                    .map(c => ({ studentId: c.studentId }))
            };
        });

        res.json(result);
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
        if (err) return console.error(err);  
        createdExam.examCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await createdExam.save();

    // Check if the new exam is set as default, and if so, change all other defaults to false.
    if (createdExam.default) {
      await examModel.updateMany({ default: true, _id: { $ne: createdExam._id } }, { $set: { default: false } });
    }

    // Emit event to all student's in school
    const examToEmit = await populateExamWithEnrollment(createdExam._id);
  
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examCreated', data: examToEmit});
    }

    res.status(201).json(examToEmit);
  } catch (error) {
    console.error("Error creating new exam or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

// populate the exam with enrollment and completion so it can be returned correctly to the frontend end sockets
const populateExamWithEnrollment = async (examId) => {
  const exam = await examModel.findById(examId).lean();
  if (!exam) return null;

  const enrollments = await Enrollment.find({ examId });
  const completions = await Completion.find({ examId });

  return {
      ...exam,
      studentsEnrolled: enrollments.map(e => e.studentId),
      studentsCompleted: completions.map(c => ({ studentId: c.studentId, mark: c.mark })),
      aiMarkingComplete: completions.filter(c => c.aiMarked).map(c => ({ studentId: c.studentId }))
  };
};

router.patch('/register/:id', async (req, res) => {
  try {
    const exam = await examModel.findById(req.params.id);

    if (!exam) {
      return res.status(404).json('Exam not found');
    }

    const userId = req.body._id;

    // Check Enrollment model
    const existingEnrollment = await Enrollment.findOne({ examId: exam._id, studentId: userId });
    if (existingEnrollment) {
      return res.status(400).json('User has already signed up for this exam');
    }

    // Create record in the collection
    await Enrollment.create({ examId: exam._id, studentId: userId });

    // emit socket
    const examToEmit = await populateExamWithEnrollment(exam._id);
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examUpdated', data: examToEmit});
    }
    
    res.json(`Student added to: ${examToEmit._id}`);
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
        if (err) return console.error(err);  
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
            await questionSubmissionModel.deleteMany({ questionId: q._id });
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

      exam.questions.push((created._id ?? created.questionId).toString());
    }

    // ---------------- REBUILD EXAM QUESTIONS ----------------
    const finalQuestions = await questionModel.find(
      { examId: exam._id },
      { _id: 1 }
    );

    exam.questions = finalQuestions.map(q => q._id.toString());

    await exam.save();
  
    // socket:
    const examToEmit = await populateExamWithEnrollment(exam._id);
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examUpdated', data: examToEmit});
    }

    res.json(`Exam updated: ${examToEmit._id}`);
  } catch (error) {
    console.error("Error updating exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/reset-student-exam/:id', async (req, res) => {
  try {
    const examId = req.params.id;
    const { studentId } = req.body;

    if (!studentId) return res.status(400).json('Student ID required');

    // Update the exam completion status
    const exam = await examModel.findById(examId);
    if (!exam) return res.status(404).json('Exam not found');

    const schoolId = exam.schoolId; 

    // Find all submissions for this student in this exam
    const submissions = await questionSubmissionModel.find({ examId, studentId });

    // Delete audio files from Cloudinary for those submissions
    for (const sub of submissions) {
      if (sub.response && sub.response.includes('cloudinary.com')) {
         const fileName = sub.response.split("/").pop().split(".")[0];
         // schoolId is now safely defined for this string interpolation
         await cloudinary.uploader.destroy(`${schoolId}/exam-question-responses/${examId}/${fileName}`, { resource_type: 'video' });
      }
    }

    // 3. Remove all submission documents for this student/exam
    await questionSubmissionModel.deleteMany({ examId, studentId });

    // 4. Update the exam completion status
    await Completion.deleteMany({ examId, studentId });

    // emit socket event

    const examToEmit = await populateExamWithEnrollment(exam._id);
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examUpdated', data: examToEmit});
    }

    res.json(`Student exam reset successfully`);
  } catch (error) {
    console.error("Error resetting student exam:", error);
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

    const existingEnrollments = await Enrollment.find({ 
        examId: exam._id, 
        studentId: { $in: studentIds } 
    });
    const existingIds = existingEnrollments.map(e => e.studentId);
    
    const newEnrollments = studentIds
        .filter(id => !existingIds.includes(id))
        .map(id => ({ examId: exam._id, studentId: id }));

    if (newEnrollments.length > 0) {
        await Enrollment.insertMany(newEnrollments);
    }

    const examToEmit = await populateExamWithEnrollment(exam._id);
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examUpdated', data: examToEmit});
    }

    res.json(examToEmit);
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

    const isEnrolled = await Enrollment.findOne({ examId: exam._id, studentId });
    if (!isEnrolled) {
      return res.status(400).json('User is not currently enrolled in this exam');
    }

    const hasCompleted = await Completion.findOne({ examId: exam._id, studentId });
    if (hasCompleted) {
      return res.status(400).json('User has already completed the exam and therefore cannot be removed');
    }
  
    // Delete the enrollment record
    await Enrollment.deleteOne({ examId: exam._id, studentId });
    
    const examToEmit = await populateExamWithEnrollment(exam._id);
    if(examToEmit?.schoolId) {
      const io = getIo();
      io.emit('examEvent-' + examToEmit.schoolId, {action: 'examUpdated', data: examToEmit});
    }

    res.json(examToEmit);
  } catch (error) {
    console.error("Error un enrolling from exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/bulk-delete', async (req, res) => {
  try {
    const examIds = req.body;

    if (!Array.isArray(examIds) || examIds.length === 0) {
      return res.status(400).json({ message: 'No exams provided' });
    }

    // Find exams first so we can return + emit them
    const examsToDelete = await examModel.find({ _id: { $in: examIds } });

    if (examsToDelete.length === 0) {
      return res.status(404).json({ message: 'No exams found' });
    }

    // Delete related questions (like single delete does)
    await questionModel.deleteMany({ examId: { $in: examIds } });
    await questionSubmissionModel.deleteMany({ examId: { $in: examIds } });

    // Delete relational participation data
    await Enrollment.deleteMany({ examId: { $in: examIds } });
    await Completion.deleteMany({ examId: { $in: examIds } });

    // Delete cloudinary folders for each exam
    for (const exam of examsToDelete) {
      const schoolId = exam.schoolId;
      const examId = exam._id;

      // Prompts
      const folderPathPrompts = `${schoolId}/exam-prompts/${examId}`;
      await deleteCloudinaryFolderIfExists(folderPathPrompts);

      // Responses
      const folderPathResponses = `${schoolId}/exam-question-responses/${examId}`;
      await deleteCloudinaryFolderIfExists(folderPathResponses);

      // Cover photo
      const folderPathCoverPhoto = `${schoolId}/exam-prompts/${examId}/cover-photo`;
      await deleteCloudinaryFolderIfExists(folderPathCoverPhoto);
    }

    // Now delete exams
    await examModel.deleteMany({ _id: { $in: examIds } });

    // Emit socket events
    const io = getIo();
    examsToDelete.forEach(exam => {
      io.emit(
        'examEvent-' + exam.schoolId,
        { action: 'examDeleted', data: exam }
      );
    });

    res.status(200).json(examsToDelete);
  } catch (error) {
    console.error('Error bulk deleting exams:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const examId  = req.params.id;
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
      return;
    }

    // Delete questions
    await questionModel.deleteMany({ examId });
    await questionSubmissionModel.deleteMany({ examId });

    // Delete relational participation data
    await Enrollment.deleteMany({ examId });
    await Completion.deleteMany({ examId });

    const schoolId = deletedExam.schoolId;

    // Delete exam prompts
    const folderPathPrompts = `${schoolId}/exam-prompts/${examId}`;
    await deleteCloudinaryFolderIfExists(folderPathPrompts);

    // Delete exam responses
    const folderPathResponses = `${schoolId}/exam-question-responses/${examId}`;
    await deleteCloudinaryFolderIfExists(folderPathResponses);

    // Delete cover photo
    const folderPathCoverPhoto = `${schoolId}/exam-prompts/${examId}/cover-photo`;
    await deleteCloudinaryFolderIfExists(folderPathCoverPhoto);

    // Emit event to all students in school
    if(deletedExam?.schoolId) {
      const io = getIo();
      io.emit(
        'examEvent-' + deletedExam.schoolId,
        { action: 'examDeleted', data: deletedExam }
      );
    }

    res.status(200).json(deletedExam);

  } catch (error) {
    console.error("Error deleting exam:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = {
  router,
};
