const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const { getIo } = require('../socket-io'); // Import the getIo function
const { deleteFile } = require('../file-helper.js');
const { createStudentStat } = require('./StudentStatsRoutes.js');

const { homeworkModel, homeworkCommentModel } = require('../models/homework-model');

/**
 * Helper function to delete comment attachments from Cloudinary
 */
const deleteCommentAttachments = (comments) => {
  comments.forEach(comment => {
    if (comment.attachment?.fileName) {
      deleteFile(comment.attachment.fileName);
    }
  });
};

/**
 * ==============================
 *  Get Homework
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

/**
 * ==============================
 *  Create new homework item
 * ==============================
 */

router.post('/', async (req, res) => {
  try {
    const newHomework = await new homeworkModel(req.body);
    const createdHomework = await newHomework.save();

    //--- upload attachment:
    if (createdHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
        const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { folder: `${req.body.schoolId}/homework-attachments` });
        createdHomework.attachment = { url: attachment.url, fileName: attachment.public_id };
        await createdHomework.save();
    }

    res.status(201).json(createdHomework);

    // Emit event to all connected clients after homework is created
    if(createdHomework.schoolId) {
      const io = getIo();
      io.emit('homeworkEvent-' + createdHomework.schoolId, {action: 'homeworkCreated', data: {homework: createdHomework}});
    }
  } catch (error) {
    console.error("Error creating new homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Enroll new students in homework
 * ==============================
 */

router.patch('/enrol-students/:id', async (req, res) => {
  try {
    const homework = await homeworkModel.findById(req.params.id);
    
    if (!homework) {
      return res.status(404).json('Homework not found');
    }

    const studentIds = req.body.studentIds;

    // Get current and new student IDs
    const currentStudentIds = homework.students.map(s => s.studentId);
    const newStudentIds = req.body.studentIds || [];
    const removedStudentIds = currentStudentIds.filter(id => !newStudentIds.includes(id));

    // Delete comments and attachments for removed students
    if (removedStudentIds.length > 0) {
      const commentsToDelete = await homeworkCommentModel.find({ homeworkId: homework._id, studentId: { $in: removedStudentIds } });
      deleteCommentAttachments(commentsToDelete);
      await homeworkCommentModel.deleteMany({ homeworkId: homework._id, studentId: { $in: removedStudentIds } });
    }

    // Remove students not in req.body from homework.students
    homework.students = homework.students.filter(s => newStudentIds.includes(s.studentId));

    // Add new students to homework.students
    for (const id of newStudentIds) {
      if (!homework.students.some(st => st.studentId.toString() === id)) {
        homework.students.push({ studentId: id, completed: false });
      }
    }
    await homework.save();
    res.json(homework);

    if(homework?.schoolId) {
      const io = getIo();
      io.emit('homeworkEvent-' + homework.schoolId, {action: 'homeworkUpdated', data: {homework: homework}});
    }
  } catch (error) {
    console.error("Error enrolling students in homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Modify homework
 * ==============================
 */

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

    //--- upload attachment:
    if (updatedHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
      const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { folder: `${req.body.schoolId}/homework-attachments` });
      updatedHomework.attachment = { url: attachment.url, fileName: attachment.public_id };
      await updatedHomework.save();

      //--- delete previous attachment:
      if (attachment) {
        const { fileName } = unModifiedHomework.attachment;
        await cloudinary.uploader.destroy(fileName, (err, result) => {
          if (err) console.error('Error deleting previous attachment:', err);
        });
      }
    }

    if (updatedHomework) {
      // --- remove comments from removed students
      const currentStudentList = unModifiedHomework.students.map(student => student.studentId.toString());
      const newStudentList = req.body.students.map(student => student.studentId.toString());
      const removedStudents = currentStudentList.filter(studentId => !newStudentList.includes(studentId));
      
      if (removedStudents.length > 0) {
        const commentsToDelete = await homeworkCommentModel.find({ homeworkId: updatedHomework._id, studentId: { $in: removedStudents } });
        deleteCommentAttachments(commentsToDelete);
        await homeworkCommentModel.deleteMany({ homeworkId: updatedHomework._id, studentId: { $in: removedStudents } });
      }

      // Emit event to all connected clients after homework is updated
      if(updatedHomework.schoolId) {
        const io = getIo();
        io.emit('homeworkEvent-' + updatedHomework.schoolId, {action: 'homeworkUpdated', data: {homework: updatedHomework}});
      }

      res.status(200).json(updatedHomework);
    } else {
      res.status(404).json({ message: "Homework not found" });
    }
  } catch (error) {
    console.error("Error updating Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Delete homework
 * ==============================
 */

router.delete('/bulk-delete', async (req, res) => {
  try {
    const homeworkIds = req.body;
    if (!Array.isArray(homeworkIds) || homeworkIds.length === 0) {
      return res.status(400).json({ message: 'No homework ids provided' });
    }

    const homeworkToDelete = await homeworkModel.find({ _id: { $in: homeworkIds } });
    if (homeworkToDelete.length === 0) {
      return res.status(404).json({ message: 'No homework found' });
    }

    // 1. Fetch ALL comments for ALL matching homework items in one single query
    const allCommentsToDelete = await homeworkCommentModel.find({ homeworkId: { $in: homeworkIds } });
    
    // 2. Clear comment file attachments from Cloudinary
    deleteCommentAttachments(allCommentsToDelete);

    // 3. Clear homework file attachments from Cloudinary
    for (const homework of homeworkToDelete) {
      if (homework.attachment?.fileName) {
        await cloudinary.uploader.destroy(homework.attachment.fileName).catch(err => 
          console.error('Error deleting homework attachment:', err)
        );
      }
    }

    // 4. Batch delete all comment documents and homework documents simultaneously
    await Promise.all([
      homeworkCommentModel.deleteMany({ homeworkId: { $in: homeworkIds } }),
      homeworkModel.deleteMany({ _id: { $in: homeworkIds } })
    ]);

    res.status(200).json(homeworkToDelete);

    // Emit socket events
    const io = getIo();
    homeworkToDelete.forEach(homework => {
      if(homework?.schoolId) {
        io.emit(
          'homeworkEvent-' + homework.schoolId,
          { action: 'homeworkDeleted', data: {homework: homework} }
        );
      }
    });
    } catch (error) {
    console.error("Error deleting Homework exercises:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/remove-student', async (req, res) => {
  try {
    const { studentId, homeworkItemId } = req.query;

    // Validate input
    if (!studentId || !homeworkItemId) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Find the homework item by ID
    const homeworkItem = await homeworkModel.findById(homeworkItemId);
    if (!homeworkItem) {
      return res.status(404).json({ message: 'Homework item not found' });
    }

    // Remove the student from the homework item students list
    homeworkItem.students = homeworkItem.students.filter((student) => student.studentId !== studentId);

    // Delete comments and attachments for the removed student
    const commentsToDelete = await homeworkCommentModel.find({ homeworkId: homeworkItem._id, studentId: studentId });
    deleteCommentAttachments(commentsToDelete);

    // Correctly filter out comments by the student
    await homeworkCommentModel.deleteMany({ homeworkId: homeworkItem._id, studentId: studentId });

    await homeworkItem.save();

    res.status(200).json(homeworkItem);

    // Emit event to all connected clients after homework is updated
    if(homeworkItem.schoolId) {
        const io = getIo();
        io.emit('homeworkEvent-' + homeworkItem.schoolId, {action: 'homeworkUpdated', data: {homework: homeworkItem}});
    }
  } catch (error) {
    console.error("Error removing student from Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedHomework = await homeworkModel.findByIdAndDelete(req.params.id);
    if (deletedHomework) {

      // --- delete comment attachments:
      const commentsToDelete = await homeworkCommentModel.find({ homeworkId: deletedHomework._id });
      deleteCommentAttachments(commentsToDelete);
      await homeworkCommentModel.deleteMany({ homeworkId: deletedHomework._id });

      // --- delete homework attachment:
      if(deletedHomework.attachment?.fileName) {
        const { fileName } = deletedHomework.attachment;
        await cloudinary.uploader.destroy(fileName, (err, result) => {
          if (err) console.error('Error deleting homework attachment:', err);
        });
      }

      res.status(200).json(deletedHomework);

      // Emit socket events
      if(deletedHomework?.schoolId) {
        const io = getIo();
        io.emit('homeworkEvent-' + deletedHomework.schoolId, {action: 'homeworkDeleted', data: {homework: deletedHomework}});
      }
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
 *  Side nav Badge
 * ==============================
 */

router.get('/badge-count', async (req, res) => {
  try {
    const { userId, userType } = req.query;

    if (!userId || !userType) {
      return res.status(400).json({ message: 'Missing userId or userType parameters.' });
    }

    // --- STUDENT BADGE COUNT CALCULATIONS ---
    if (userType === 'student') {
      const incompleteCount = await homeworkModel.countDocuments({
        students: {
          $elemMatch: { studentId: userId, completed: false }
        }
      });

      return res.json({ count: incompleteCount });
    }

    // --- TEACHER BADGE COUNT CALCULATIONS ---
    if (userType === 'teacher') {
      const pipeline = [
        // Step 1: Filter down strictly to this teacher's active assignments
        { $match: { assignedTeacherId: userId } },
        
        // Step 2: Join the comments using the indexed compound reference
        {
          $lookup: {
            from: 'homeworkcommentmodels', // Double-check exact collection name in MongoDB
            localField: '_id',
            foreignField: 'homeworkId',
            as: 'comments'
          }
        },
        
        // Step 3: Project the document layout to find the absolute latest comment
        {
          $project: {
            latestComment: {
              $arrayElemAt: [
                {
                  $sortArray: { 
                    input: '$comments', 
                    sortBy: { createdAt: -1 } 
                  }
                },
                0
              ]
            }
          }
        },
        
        // Step 4: Keep documents only where the most recent comment is a submission needing review
        { 
          $match: { 
            'latestComment.commentType': 'submission' 
          } 
        },
        
        // Step 5: Count the remaining rows cleanly
        { $count: 'total' }
      ];

      const result = await homeworkModel.aggregate(pipeline);
      const count = result.length > 0 ? result[0].total : 0;
      
      return res.json({ count });
    }

    // Fallback default for alternative roles like 'school' or administrators
    return res.json({ count: 0 });

  } catch (error) {
    console.error('Error computing badge count state:', error);
    return res.status(500).send('Internal Server Error');
  }
});

/**
 * ==============================
 *  Comments
 * ==============================
 */

router.get('/comments', async (req, res) => {
  try {
    const { homeworkIds, studentId } = req.query;

    if (!homeworkIds) {
      return res.status(400).send("homeworkIds parameter is required");
    }

    const idArray = homeworkIds.split(',');

    const query = {
      homeworkId: { $in: idArray }
    };

    if (studentId) {
      query.studentId = studentId;
    }

    const comments = await homeworkCommentModel
      .find(query)
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/new-comment', async (req, res) => {
  try {
    const homeworkId = req.body.homeworkId;
    const newComment = req.body.feedback;
    newComment.createdAt = new Date();
      
    const updatedHomework = await homeworkModel.findById(homeworkId);

    if (!updatedHomework) {
      return res.status(404).json({ error: 'Homework not found' });
    }

    const commentDoc = new homeworkCommentModel({ homeworkId, ...newComment });
    if (newComment.attachment?.url && req.body.schoolId) {
      const attachment = await cloudinary.uploader.upload(newComment.attachment.url, { folder: `${req.body.schoolId}/homework-comment-attachments` });
      commentDoc.attachment = { url: attachment.url, fileName: attachment.public_id };
    }
    await commentDoc.save();

    // --- update student 'pass' status in homework item if comment.pass === true
    const studentIndex = updatedHomework.students.findIndex(student => student.studentId === newComment.studentId);
    if (studentIndex !== -1 && newComment.commentType.toLowerCase() === 'feedback') {
      updatedHomework.students[studentIndex].completed = (newComment.pass === true);
      await updatedHomework.save();
    }

    // --- add student stats:
    if(newComment.commentType === 'feedback' && newComment.duration > 0) {
      await createStudentStat({
        studentId: newComment.studentId, 
        activityType: 'homework',
        minutes: newComment.duration,
        date: Date.now(),
        comment: `homework item: ${updatedHomework.name}`,
        referenceId: updatedHomework._id,
      })
    }

    res.status(201).json({ comment: commentDoc, homework: updatedHomework });

    // --- socket io:
    if(updatedHomework.schoolId) {
      getIo().emit('homeworkEvent-' + updatedHomework.schoolId, {
        action: 'homeworkCommentCreated', 
        data: { comment: commentDoc, homework: updatedHomework }
      });
    }
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
  
    // --- filter comments from homework item to match the req.body.commentType
    const commentToUpdate = await homeworkCommentModel.findOne({
      homeworkId,
      commentType: { $regex: new RegExp(`^${newComment.commentType}$`, 'i') },
      ...(newComment.commentType.toLowerCase() === 'submission' ? { studentId: newComment.studentId } : { teacherId: newComment.teacherId })
    }).sort({ createdAt: -1 });

    if (!commentToUpdate) return res.status(404).json({ error: 'Comment not found' });

    Object.assign(commentToUpdate, newComment);
    await commentToUpdate.save();
  
    // --- update student 'pass' status in homework item if comment.pass === true
    const studentIndex = updatedHomework.students.findIndex(student => student.studentId === newComment.studentId);
    if (studentIndex !== -1 && newComment.commentType.toLowerCase() === 'feedback') {
      updatedHomework.students[studentIndex].completed = (newComment.pass === true);
      await updatedHomework.save();
    }

    res.status(201).json({ comment: commentToUpdate, homework: updatedHomework });

    // Emit event to all connected clients after comment is created - emit notification of feedback to student
    if(updatedHomework.schoolId) {
      getIo().emit('homeworkEvent-' + updatedHomework.schoolId, {
        action: 'homeworkCommentUpdated', 
        data: { comment: commentToUpdate, homework: updatedHomework }
      });
    }
    
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
  
    // --- filter comments from homework item to match the req.body.commentType
    const commentToDeleteDoc = await homeworkCommentModel.findOne({
      homeworkId,
      commentType: { $regex: new RegExp(`^${commentToDelete.commentType}$`, 'i') },
      ...(commentToDelete.commentType.toLowerCase() === 'submission' ? { studentId: commentToDelete.studentId } : { teacherId: commentToDelete.teacherId })
    }).sort({ createdAt: -1 });

    if (!commentToDeleteDoc) return res.status(404).json({ error: 'Comment not found' });

    if(commentToDeleteDoc.attachment?.fileName) {
      await cloudinary.uploader.destroy(commentToDeleteDoc.attachment.fileName);
    }
    await homeworkCommentModel.findByIdAndDelete(commentToDeleteDoc._id);
  
    // --- update student 'pass' status in homework item
    const studentIndex = updatedHomework.students.findIndex(student => student.studentId === commentToDelete.studentId);
    if (studentIndex !== -1 && commentToDelete.commentType.toLowerCase() === 'feedback') {
      updatedHomework.students[studentIndex].completed = false;
      await updatedHomework.save();
    }

    res.status(201).json({ comment: commentToDeleteDoc, homework: updatedHomework });

    // Emit event to all connected clients after comment is created - emit notification of feedback to student
    if(updatedHomework.schoolId) {
      getIo().emit('homeworkEvent-' + updatedHomework.schoolId, {
        action: 'homeworkCommentDeleted', 
        data: { comment: commentToDeleteDoc, homework: updatedHomework }
      });
    }
  } catch (error) {
    console.error("Error modifying comment on homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;