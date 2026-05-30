const express = require("express");
const router = express.Router();

const { 
  courseworkModel,
  courseworkEnrollmentModel, 
  courseworkCompletionModel 
} = require('../models/coursework-model');

const { 
  questionModel, 
  questionSubmissionModel 
} = require("../models/question-model");

const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');
const { createQuestion, deleteQuestion } = require('./QuestionRoutes');
const {
  deleteCloudinaryFolderIfExists
} = require('../file-helper.js');

/**
 * ====================
 * Get
 * ====================
 */

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;
      
        // If currentSchoolId is provided, filter course by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        // Use lean() for faster querying since we just need the raw data
        const baseCourses = await courseworkModel.find(filter).lean();
        
        // Populate all courses with their relational data
        const populatedCourses = await Promise.all(
            baseCourses.map(course => populateCourseworkWithEnrollment(course._id))
        );

        // Filter out any potential nulls if a course was deleted mid-query
        const validCourses = populatedCourses.filter(c => c !== null);

        res.json(validCourses);
    } catch (error) {
        console.error("Error getting courses:", error);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * ====================
 * Create
 * ====================
 */

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

    // --- add questions:
    const questionIds = [];
    for (let question of req.body.questions) {
      const createdQuestion = await createQuestion(question, createdCourse._id, req.body.schoolId);
      questionIds.push((createdQuestion._id ?? createdQuestion.questionId).toString());
    }
    createdCourse.questions = questionIds;

    // --- upload photo to cloudinary (todo - move ot service):
    if(createdCourse.courseCoverPhoto?.url) {
      await cloudinary.uploader.upload(createdCourse.courseCoverPhoto.url, {folder: `${req.body.courseData.schoolId}/exam-prompts/${createdCourse._id}/cover-photo`}, async (err, result)=>{
        if (err) return console.error(err);  
        createdCourse.courseCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await createdCourse.save();

    // Emit event to all student's in school

    const courseToEmit = await populateCourseworkWithEnrollment(createdCourse._id);

    if(courseToEmit?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + courseToEmit.schoolId, {action: 'courseCreated', data: courseToEmit});
    }
    
    res.status(201).json(courseToEmit);
  } catch (error) {
    console.error("Error creating new course or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ====================
 * Enrol Students in Course
 * ====================
 */

router.patch('/enrol-students/:id', async (req, res) => {
  try {
    const course = await courseworkModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json('Course not found');
    }

    const incomingStudentIds = req.body.studentIds;

    // Remove students not in req.body from course.studentsEnrolledIds
    await courseworkEnrollmentModel.deleteMany({
      courseworkId: course._id,
      studentId: { $nin: incomingStudentIds }
    });

    // Fetch remaining enrollments to avoid duplicates
    const existingEnrollments = await courseworkEnrollmentModel.find({ courseworkId: course._id });
    const existingStudentIds = existingEnrollments.map(e => e.studentId);

    // Insert new enrollments
    const newStudentIds = incomingStudentIds.filter(id => !existingStudentIds.includes(id));
    if (newStudentIds.length > 0) {
      const enrollmentsToCreate = newStudentIds.map(id => ({ 
        courseworkId: course._id, 
        studentId: id 
      }));
      await courseworkEnrollmentModel.insertMany(enrollmentsToCreate);
    }
  
    // Populate and emit
    const courseToEmit = await populateCourseworkWithEnrollment(course._id);

    if(courseToEmit?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + courseToEmit.schoolId, {action: 'courseUpdated', data: courseToEmit});
    }

    res.json(courseToEmit);
  } catch (error) {
    console.error("Error enrolling students in course:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ====================
 * Student Signup for Course
 * ====================
 */

router.patch('/register/:id', async (req, res) => {
  try {
    const course = await courseworkModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json('Course not found');
    }

    const userId = req.body._id;

    const existingEnrollment = await courseworkEnrollmentModel.findOne({ courseworkId: course._id, studentId: userId });
    
    if (existingEnrollment) {
      return res.status(400).json('User has already signed up for this course');
    }

    await courseworkEnrollmentModel.create({ courseworkId: course._id, studentId: userId });

    // --- socket emit:

    const courseToEmit = await populateCourseworkWithEnrollment(course._id);

    if(courseToEmit?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + courseToEmit.schoolId, {action: 'courseUpdated', data: courseToEmit});
    }

    res.json(courseToEmit);
  } catch (error) {
    console.error("Error joining course:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ====================
 * Edit Course
 * ====================
 */

router.patch('/update-course/:id', async (req, res) => {
  try {
    const courseData = req.body.courseData;
    const course = await courseworkModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json('Course not found');
    }

    const { courseCoverPhoto, ...courseDataWithoutPhoto } = courseData;

    Object.assign(course, courseDataWithoutPhoto);

    // --- upload photo to cloudinary:
    if(courseData.courseCoverPhoto?.url) {
      // Delete old cover photo: (todo - move to file service)
      const schoolId = courseData.schoolId;
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
      await cloudinary.uploader.upload(courseData.courseCoverPhoto.url, {folder: `${courseData.schoolId}/exam-prompts/${course._id}/cover-photo`}, async (err, result)=>{
        if (err) return console.error(err);  
        course.courseCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await course.save();
 
    // ---------------- NORMALIZE ----------------
    const getQid = q => (q._id || q.questionId || q).toString();
    const incoming = req.body.questions || [];

    const incomingIds = [];
    const incomingMap = new Map();

    incoming.forEach(q => {
      if (q) {
        const id = getQid(q);
        incomingIds.push(id);
        incomingMap.set(id, q);
        if (Array.isArray(q.subQuestions)) {
          q.subQuestions.forEach(sub => {
            if (sub) {
              const subId = getQid(sub);
              incomingIds.push(subId);
              incomingMap.set(subId, sub);
            }
          });
        }
      }
    });

    const dbQuestions = await questionModel.find({ examId: course._id }, { _id: 1 });
    const dbIds = dbQuestions.map(q => q._id.toString());

    // ---------------- DIFF ----------------
    const idsToDelete = dbIds.filter(id => !incomingIds.includes(id));
    const idsToAdd    = incomingIds.filter(id => !dbIds.includes(id));
    const idsToUpdate = incomingIds.filter(id => dbIds.includes(id));

    // ---------------- DELETE ----------------
    if (idsToDelete.length) {
      const deleteDocs = await questionModel.find({ _id: { $in: idsToDelete } });
      for (const q of deleteDocs) {
        await deleteQuestion(q, course._id, course.schoolId);
        await questionSubmissionModel.deleteMany({ questionId: q._id });
      }
    }

    // ---------------- UPDATE ----------------
    for (const id of idsToUpdate) {
      const doc = await questionModel.findById(id);
      const incomingData = incomingMap.get(id);
      if (doc && incomingData) {
        doc.name = incomingData.name;
        await doc.save();
      }
    }

    // ---------------- ADD ----------------
    const allIncomingQuestions = Array.from(incomingMap.values());
    for (const q of allIncomingQuestions.filter(q => idsToAdd.includes(getQid(q)))) {
      const sanitized = { ...q };
      delete sanitized._id;
      if (sanitized.subQuestions) delete sanitized.subQuestions; 

      const created = await createQuestion(sanitized, course._id, course.schoolId);
      
      // FIX: Add string ID to root array instead of an object
      course.questions.push((created._id ?? created.questionId).toString());
    }

    // ---------------- REBUILD COURSE QUESTIONS ----------------
    const finalQuestions = await questionModel.find({ examId: course._id }, { _id: 1 });
    course.questions = finalQuestions.map(q => q._id.toString());

    await course.save();

    // Populate and emit
    const courseToEmit = await populateCourseworkWithEnrollment(course._id);

    if(courseToEmit?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + courseToEmit.schoolId, {action: 'courseUpdated', data: courseToEmit});
    }
    
    res.json(courseToEmit);
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ====================
 * Delete course (bulk)
 * ====================
 */

router.delete('/bulk-delete', async (req, res) => {
  try {
    const courseIds = req.body;
    if (!Array.isArray(courseIds) || courseIds.length === 0) return res.status(400).json({ message: 'No courses provided' });

    const coursesToDelete = await courseworkModel.find({ _id: { $in: courseIds } }).lean();
    if (coursesToDelete.length === 0) {
      return res.status(404).json({ message: 'No courses found' });
    }

    // CASCADE DELETES: Wipe all associated records
    await questionModel.deleteMany({ examId: { $in: courseIds } }); 
    await questionSubmissionModel.deleteMany({ examId: { $in: courseIds } });
    await courseworkEnrollmentModel.deleteMany({ courseworkId: { $in: courseIds } });
    await courseworkCompletionModel.deleteMany({ courseworkId: { $in: courseIds } });

    for (const courses of coursesToDelete) {
      const schoolId = courses.schoolId;
      const courseId = courses._id;

      await deleteCloudinaryFolderIfExists(`${schoolId}/exam-prompts/${courseId}`);
      await deleteCloudinaryFolderIfExists(`${schoolId}/exam-question-responses/${courseId}`);
      await deleteCloudinaryFolderIfExists(`${schoolId}/exam-prompts/${courseId}/cover-photo`);
    }

    await courseworkModel.deleteMany({ _id: { $in: courseIds } });

    // Format for frontend state deletion (attach empty arrays so frontend doesn't crash reading DTO properties)
    const formattedDeletedCourses = coursesToDelete.map(c => ({
      ...c,
      studentsEnrolled: [],
      studentsCompleted: [],
      questions: (c.questions || []).map(qId => ({ questionId: qId.toString(), studentsCompleted: [] }))
    }));


    const io = getIo();
    formattedDeletedCourses.forEach(course => {
      io.emit('courseEvent-' + course.schoolId, { action: 'courseDeleted', data: course });
    });

    res.status(200).json(formattedDeletedCourses);
  } catch (error) {
    console.error('Error bulk deleting courses:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * ====================
 * Delete  Course (single)
 * ====================
 */
router.delete('/:id', async (req, res) => {
  try {
    const courseId  = req.params.id
    const course = await courseworkModel.findById(courseId).lean();

    if(!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // CASCADE DELETES
    await courseworkModel.findByIdAndDelete(courseId);
    await questionModel.deleteMany({ examId: courseId });
    await questionSubmissionModel.deleteMany({ examId: courseId });
    await courseworkEnrollmentModel.deleteMany({ courseworkId: courseId });
    await courseworkCompletionModel.deleteMany({ courseworkId: courseId });

    const schoolId = course.schoolId;
    const folderPathPrompts = `${schoolId}/exam-prompts/${courseId}`;
    const { resources: promptFolder } = await cloudinary.api.resources({ type: "upload", prefix: folderPathPrompts, max_results: 1 });
    
    if(promptFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathPrompts);
      await cloudinary.api.delete_folder(folderPathPrompts);
    }

    const folderPathCoverPhoto = `${schoolId}/exam-prompts/${req.params.id}/cover-photo`;
    const { resources: coverPhotoFolder } = await cloudinary.api.resources({ type: "upload", prefix: folderPathCoverPhoto, max_results: 1 });
    if(coverPhotoFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathCoverPhoto);
      await cloudinary.api.delete_folder(folderPathCoverPhoto);
    }

    // Format for frontend state deletion
    const formattedDeletedCourse = {
      ...course,
      studentsEnrolled: [],
      studentsCompleted: [],
      questions: (course.questions || []).map(qId => ({ questionId: qId.toString(), studentsCompleted: [] }))
    };

    if(formattedDeletedCourse?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + formattedDeletedCourse.schoolId, {action: 'courseDeleted', data: formattedDeletedCourse});
    }
    
    res.status(200).json(formattedDeletedCourse);
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * =======================================
 * Helper function to populate course with enrollment and completion.
 * =======================================
 */

async function populateCourseworkWithEnrollment(courseworkId) {
  const course = await courseworkModel.findById(courseworkId).lean();
  if (!course) return null;

  // Fetch relational tracking data
  const enrollments = await courseworkEnrollmentModel.find({ courseworkId });
  const completions = await courseworkCompletionModel.find({ courseworkId });
  
  // Fetch question submissions for this specific coursework
  const questionSubmissions = await questionSubmissionModel.find({ 
    examId: course._id.toString(), // courseworkId is stored here
    questionId: { $in: course.questions || [] }
  }).lean();

  // Rebuild the frontend 'questions' array shape
  const formattedQuestions = (course.questions || []).map(qId => {
    const qIdStr = qId.toString();
    
    // Find all submissions for this specific question
    const submissionsForThisQuestion = questionSubmissions.filter(
      sub => sub.questionId.toString() === qIdStr
    );

    return {
      questionId: qIdStr,
      studentsCompleted: submissionsForThisQuestion.map(sub => sub.studentId)
    };
  });

  // Return the fully stitched object matching DTO
  return {
      ...course,
      studentsEnrolled: enrollments.map(e => e.studentId),
      studentsCompleted: completions.map(c => c.studentId),
      questions: formattedQuestions
  };
};

module.exports = router;
