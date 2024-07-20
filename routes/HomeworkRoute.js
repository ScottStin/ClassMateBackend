const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });

const homeworkModel = require('../models/homework-model');

/**
 * ==============================
 *  Homework
 * ==============================
 */

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;

        // If currentSchoolId is provided, filter homework by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        // Find homework based on the filter
        const homework = await homeworkModel.find(filter);

        // Send the filtered homework as the response
        res.json(homework);
    } catch (error) {
        console.error("Error getting homework:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/', async (req, res) => {
  try {
    const newHomework = await new homeworkModel(req.body);
    const createdHomework = await newHomework.save();

    if (createdHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
        const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { folder: `${req.body.schoolId}/homework-attachments` });
        createdHomework.attachment = { url: attachment.url, fileName: attachment.public_id };
        await createdHomework.save();
    }
    
    res.status(201).json(createdHomework);
  } catch (error) {
    console.error("Error creating new homework:", error);
    res.status(500).send("Internal Server Error");
  }
});


router.patch('/:id', async (req, res) => {
  try {
    const unModifiedHomework = await homeworkModel.findById(req.params.id);

    if (!unModifiedHomework) {
      return res.status(404).json({ message: "Homework not found" });
    }

    const updatedHomework = await homeworkModel.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    if (updatedHomework) {
      res.status(200).json(updatedHomework);

      // --- remove comments from removed students
      const currentStudentList = unModifiedHomework.students.map(student => student.studentId.toString());
      const newStudentList = req.body.students.map(student => student.studentId.toString());
      const removedStudents = currentStudentList.filter(studentId => !newStudentList.includes(studentId));
      
      if (removedStudents.length > 0) {
        updatedHomework.comments = updatedHomework.comments.filter(comment => !removedStudents.includes(comment.student.toString()));
        await updatedHomework.save();
      }

    } else {
      res.status(404).json({ message: "Homework not found" });
    }
  } catch (error) {
    console.error("Error updating Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedHomework = await homeworkModel.findByIdAndDelete(req.params.id);
    if (deletedHomework) {
      res.status(200).json(deletedHomework);
    } else {
      res.status(404).json({ message: "Homework not found" });
    }
  } catch (error) {
    console.error("Error deleting Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Comments (TODO - move comments to their own service and create dedicated comment model/route in backend)
 * ==============================
 */


router.post('/new-comment', async (req, res) => {
  try {
    const homeworkId = req.body.homeworkId;
    const newComment = req.body.feedback;
    newComment.createdAt = new Date();
    console.log(newComment);
    console.log(req.body.schoolId);
      
    const updatedHomework = await homeworkModel.findById(homeworkId);

    updatedHomework.comments.push(newComment);
    await updatedHomework.save();
  
    if (!updatedHomework) {
      return res.status(404).json({ error: 'Homework not found' });
    }

    // --- set student.completed to true from this homework item if the student passed this submission attempt:
    if (newComment.pass === true) {
      const studentIndex = updatedHomework.students.findIndex(student => student.studentId === newComment.student);
      if (studentIndex !== -1) {
        updatedHomework.students[studentIndex].completed = true;
      }
    }
    await updatedHomework.save();

    // --- upload attachment:
    if (newComment.attachment && newComment.attachment?.url && newComment.attachment?.url !== '' && newComment.attachment?.fileName !== '' && req.body.schoolId) {
      const lastIndex = updatedHomework.comments.length - 1;
      const attachment = await cloudinary.uploader.upload(newComment.attachment.url, { folder: `${req.body.schoolId}/homework-comment-attachments` });
      updatedHomework.comments[lastIndex].attachment = { url: attachment.url, fileName: attachment.public_id };
      await updatedHomework.save();
      console.log('updatedHomework.comments[lastIndex].attachment')
      console.log(updatedHomework.comments[lastIndex])
    }

    res.status(201).json(updatedHomework);
  } catch (error) {
    console.error("Error adding comment to homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/update-comment', async (req, res) => {
  try {
    const homeworkId = req.body.homeworkId;
    const newComment = req.body.feedback;
      
    const updatedHomework = await homeworkModel.findById(homeworkId);

    if (!updatedHomework) {
      return res.status(404).json({ error: 'Homework not found' });
    }
  
    // --- filter comments from homwework item to match the req.body.commenType
    comments = updatedHomework.comments

    filteredComments = comments.filter((comment)=>
      comment.commentType.toLowerCase() === newComment.commentType.toLowerCase() && 
      (
        (comment.commentType.toLowerCase() === 'submission' && comment.student === newComment.student) || 
        (comment.commentType.toLowerCase() === 'feedback' && comment.teacher === newComment.teacher)
      )
    );
    
    if (filteredComments.length === 0) {
      return res.status(404).json({ error: 'Comments not found' });
    }
  
    // --- get last comment in array
    lastComment = filteredComments[filteredComments.length -1]
    
    // --- replace last comment with new comment
    const commentIndex = updatedHomework.comments.findIndex(comment => comment._id.equals(lastComment._id));

    if (commentIndex !== -1) {
      updatedHomework.comments[commentIndex] = newComment;
      updatedHomework.comments[commentIndex].createdAt = new Date();
      await updatedHomework.save();
    } else {
      return res.status(404).json({ error: 'Comment id not found' });
    }
  
    // --- update student 'pass' status in homework item if comment.pass === true
    const studentIndex = updatedHomework.students.findIndex(student => student.studentId === newComment.student);
    if (studentIndex !== -1 && newComment.commentType.toLowerCase() === 'feedback') {
      updatedHomework.students[studentIndex].completed = (newComment.pass === true);
      await updatedHomework.save();
    }

    res.status(201).json(updatedHomework);
  } catch (error) {
    console.error("Error modifying comment on homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/delete-comment', async (req, res) => {
  try {
    const homeworkId = req.body.homeworkId;
    const commentToDelete = req.body.feedback;
      
    const updatedHomework = await homeworkModel.findById(homeworkId);

    if (!updatedHomework) {
      return res.status(404).json({ error: 'Homework not found' });
    }
  
    // --- filter comments from homwework item to match the req.body.commenType
    comments = updatedHomework.comments

    filteredComments = comments.filter((comment)=>
      comment.commentType.toLowerCase() === commentToDelete.commentType.toLowerCase() && 
      (
        (comment.commentType.toLowerCase() === 'submission' && comment.student === commentToDelete.student) || 
        (comment.commentType.toLowerCase() === 'feedback' && comment.teacher === commentToDelete.teacher)
      )
    );
    
    if (filteredComments.length === 0) {
      return res.status(404).json({ error: 'Comments not found' });
    }
  
    // --- get last comment in array
    lastComment = filteredComments[filteredComments.length -1]
    
    // --- delete last comment
    const commentIndex = updatedHomework.comments.findIndex(comment => comment._id.equals(lastComment._id));

    if (commentIndex !== -1) {
      updatedHomework.comments.splice(commentIndex, 1);
      await updatedHomework.save();
    } else {
      return res.status(404).json({ error: 'Comment id not found' });
    }
  
    // --- update student 'pass' status in homework item
    const studentIndex = updatedHomework.students.findIndex(student => student.studentId === commentToDelete.student);
    if (studentIndex !== -1 && commentToDelete.commentType.toLowerCase() === 'feedback') {
      updatedHomework.students[studentIndex].completed = false;
      await updatedHomework.save();
    }

    res.status(201).json(updatedHomework);
  } catch (error) {
    console.error("Error modifying comment on homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;