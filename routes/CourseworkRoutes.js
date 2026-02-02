const express = require("express");
const router = express.Router();

const { courseworkModel } = require('../models/coursework-model');
const questionModel = require("../models/question-model");
const { cloudinary, storage } = require('../cloudinary');
const { getIo } = require('../socket-io');
const { createQuestion } = require('./QuestionRoutes');

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

    // --- add questions:
    const questionIds = [];
    for (let question of req.body.questions) {
      const createdQuestion = await createQuestion(question, createdCourse._id, req.body.schoolId);
      questionIds.push({questionId: createdQuestion.id, studentsCompleted: []});
    }
    createdCourse.questions = questionIds;

    // --- upload photo to cloudinary (todo - move ot service):
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
      io.emit('courseEvent-' + createdCourse.schoolId, {action: 'courseCreated', data: createdCourse});
    }
  } catch (error) {
    console.error("Error creating new course or adding questions:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/enrol-students/:id', async (req, res) => {
  try {
    const course = await courseworkModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json('Course not found');
    }

    const studentIds = req.body.studentIds;

    // Remove students not in req.body from course.studentsEnrolledIds
    course.studentsEnrolled = course.studentsEnrolled.filter(
      (id) => studentIds.some((student) => student._id === id)
    );

    // Add new students to course.studentsEnrolled
    for(const studentId of studentIds) {
      if (course.studentsEnrolled.includes(studentId)) {
        continue
      }
      course.studentsEnrolled.push(studentId);
    }
    await course.save();
    res.json(course);


    if(course?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + course.schoolId, {action: 'courseUpdated', data: course});
    }
  } catch (error) {
    console.error("Error enrolling students in course:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/register/:id', async (req, res) => {
  try {
    const course = await courseworkModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json('Course not found');
    }

    const userId = req.body._id;

    if (course.studentsEnrolled.includes(userId)) {
      return res.status(400).json('User has already signed up for this course');
    }

    course.studentsEnrolled.push(userId);
    await course.save();

    res.json(`Student added to: ${course}`);

    if(course?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + course.schoolId, {action: 'courseUpdated', data: course});
    }
  } catch (error) {
    console.error("Error joining course:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.patch('/update-course/:id', async (req, res) => {
  try {
    const courseData = req.body.courseData;
    const course = await courseworkModel.findById(req.params.id);

    console.log('COURS E 1');
    console.log(course);

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
        if (err) return console.log(err);  
        course.courseCoverPhoto = {url:result.url, fileName:result.public_id};
      })
    }

    await course.save();
 
    for (const question of req.body.questions) {

      const existingQuestionEntry = course.questions.find(q => q._id === question._id);
      const foundQuestion = await questionModel.findById(question._id); // double check all questions
  
      if (question._id && (existingQuestionEntry || foundQuestion)) {
        // --- update existing question
        foundQuestion.name = question.name;
        await foundQuestion.save();
      } else {
        // --- add new question
        const createdQuestion = await createQuestion(question, course._id, course.schoolId);
        course.questions.push({ questionId: createdQuestion._id, studentsCompleted: [] });
      }
    }

    course.questions = req.body.questions.map((q) => {
      return {
        questionId: q.questionId,
        studentsCompleted: q.studentsCompleted
      };
    });
    await course.save();
    res.json(`Course updated: ${course._id}`);

    if(course?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + course.schoolId, {action: 'courseUpdated', data: course});
    }
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const courseId  = req.params.id
    const course = await courseworkModel.findById(courseId);

    if(!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const deletedCourse = await courseworkModel.findByIdAndDelete(courseId);

    if (!deletedCourse) {
      res.status(404).json({ message: "Course not found" });
    }

    // Delete question
    await questionModel.deleteMany({ examId: courseId });

    // Delete course prompts (note - we use exam folder for course prompts in cloudinary):
    const schoolId = deletedCourse.schoolId;
    const folderPathPrompts = `${schoolId}/exam-prompts/${courseId}`;
    const { resources: promptFolder } = await cloudinary.api.resources({
      type: "upload",
      prefix: folderPathPrompts,
      max_results: 1
    });
    if(promptFolder?.length > 0) {
      await cloudinary.api.delete_resources_by_prefix(folderPathPrompts);
      await cloudinary.api.delete_folder(folderPathPrompts);
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

    res.status(200).json(deletedCourse);

    // Emit event to all student's in school
    if(deletedCourse?.schoolId) {
      const io = getIo();
      io.emit('courseEvent-' + deletedCourse.schoolId, {action: 'courseDeleted', data: deletedCourse});
    }
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
