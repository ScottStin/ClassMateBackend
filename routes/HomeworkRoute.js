const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const { getIo } = require('../socket-io'); // Import the getIo function
const { deleteFile } = require('../file-helper.js');
const { createStudentStat } = require('./StudentStatsRoutes.js');

const { homeworkModel, homeworkEnrollmentModel, homeworkCommentModel } = require('../models/homework-model');

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
        const currentSchoolId = req.query.currentSchoolId;

        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        const homework = await homeworkModel.find(filter).lean();
        const populatedHomework = await attachHomeworkEnrollments(homework);

        res.json(populatedHomework);
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
    const { students, ...fields } = req.body;
    
    const newHomework = new homeworkModel(fields);
    let createdHomework = await newHomework.save();

    // --- Cloudinary attachments
    if (createdHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
      try {
        const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { 
          folder: `${req.body.schoolId}/homework-attachments` 
        });
        createdHomework.attachment = { url: attachment.url, fileName: attachment.public_id };
        await createdHomework.save();
      } catch (cloudErr) {
        console.error("Cloudinary homework save upload failed:", cloudErr);
      }
    }

    // Process incoming student enrolled list (max 500)
    if (Array.isArray(students) && students.length > 0) {
      const targetedStudents = students.slice(0, 500);
      const enrollmentDocs = targetedStudents.map(s => ({
        homeworkId: createdHomework._id,
        studentId: s.studentId,
        completed: s.completed || false
      }));
      await homeworkEnrollmentModel.insertMany(enrollmentDocs, { ordered: false }).catch(() => {});
    }

    const plainHomework = createdHomework.toObject();
    const populatedHomework = await attachHomeworkEnrollments(plainHomework);

    res.status(201).json(populatedHomework);

    if (populatedHomework.schoolId) {
      const io = getIo();
      io.emit('homeworkEvent-' + populatedHomework.schoolId, {
        action: 'homeworkCreated', 
        data: { homework: populatedHomework }
      });
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
    const homeworkId = req.params.id;
    const homework = await homeworkModel.findById(homeworkId).lean();
    
    if (!homework) {
      return res.status(404).json('Homework not found');
    }

    const newStudentIds = req.body.studentIds || [];

    // Enforce strict 500 student limit gatekeeper
    if (newStudentIds.length > 500) {
      return res.status(400).json({ message: 'Homework enrollment capacity reached. Maximum 500 students allowed.' });
    }

    // Read active enrollment states
    const currentEnrollments = await homeworkEnrollmentModel.find({ homeworkId }).lean();
    const currentStudentIds = currentEnrollments.map(s => s.studentId);
    const removedStudentIds = currentStudentIds.filter(id => !newStudentIds.includes(id));

    // Cleanup comments and files for removed accounts
    if (removedStudentIds.length > 0) {
      const commentsToDelete = await homeworkCommentModel.find({ homeworkId, studentId: { $in: removedStudentIds } });
      deleteCommentAttachments(commentsToDelete);
      
      await Promise.all([
        homeworkCommentModel.deleteMany({ homeworkId, studentId: { $in: removedStudentIds } }),
        homeworkEnrollmentModel.deleteMany({ homeworkId, studentId: { $in: removedStudentIds } })
      ]);
    }

    if (newStudentIds.length > 0) {
      const bulkOps = newStudentIds.map(id => ({
        updateOne: {
          filter: { homeworkId, studentId: id },
          update: { $setOnInsert: { completed: false } },
          upsert: true
        }
      }));
      await homeworkEnrollmentModel.bulkWrite(bulkOps);
    }

    const populatedHomework = await attachHomeworkEnrollments(homework);
    res.json(populatedHomework);

    if (populatedHomework?.schoolId) {
      const io = getIo();
      io.emit('homeworkEvent-' + populatedHomework.schoolId, {
        action: 'homeworkUpdated', 
        data: { homework: populatedHomework }
      });
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
    const homeworkId = req.params.id;
    const { students, ...updatedFields } = req.body;

    const unModifiedHomeworkRaw = await homeworkModel.findById(homeworkId).lean();
    if (!unModifiedHomeworkRaw) {
      return res.status(404).json({ message: "Homework not found" });
    }
    const unModifiedHomework = await attachHomeworkEnrollments(unModifiedHomeworkRaw);

    let updatedHomework = await homeworkModel.findByIdAndUpdate(
      homeworkId, 
      { $set: updatedFields }, 
      { new: true }
    ).lean();

    // --- Cloudinary:
    if (updatedHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
      try {
        const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { 
          folder: `${req.body.schoolId}/homework-attachments` 
        });
        
        await homeworkModel.findByIdAndUpdate(homeworkId, {
          $set: { attachment: { url: attachment.url, fileName: attachment.public_id } }
        });
        updatedHomework.attachment = { url: attachment.url, fileName: attachment.public_id };

        if (unModifiedHomework.attachment?.fileName) {
          await cloudinary.uploader.destroy(unModifiedHomework.attachment.fileName).catch(err =>
            console.error('Error destroying previous assignment asset:', err)
          );
        }
      } catch (cloudErr) {
        console.error("Cloudinary attachment patch failed:", cloudErr);
      }
    }

    if (updatedHomework) {
      if (Array.isArray(students)) {
        if (students.length > 500) {
          return res.status(400).json({ message: 'Exceeds limit of 500 students.' });
        }

        const currentStudentList = unModifiedHomework.students.map(s => s.studentId);
        const newStudentList = students.map(s => s.studentId);
        const removedStudents = currentStudentList.filter(id => !newStudentList.includes(id));
        
        if (removedStudents.length > 0) {
          const commentsToDelete = await homeworkCommentModel.find({ homeworkId: updatedHomework._id, studentId: { $in: removedStudents } });
          deleteCommentAttachments(commentsToDelete);
          
          await Promise.all([
            homeworkCommentModel.deleteMany({ homeworkId: updatedHomework._id, studentId: { $in: removedStudents } }),
            homeworkEnrollmentModel.deleteMany({ homeworkId: updatedHomework._id, studentId: { $in: removedStudents } })
          ]);
        }

        if (students.length > 0) {
          const bulkOps = students.map(s => ({
            updateOne: {
              filter: { homeworkId: updatedHomework._id, studentId: s.studentId },
              update: { $setOnInsert: { completed: false } },
              upsert: true
            }
          }));
          await homeworkEnrollmentModel.bulkWrite(bulkOps);
        }
      }

      const populatedHomework = await attachHomeworkEnrollments(updatedHomework);

      if (populatedHomework.schoolId) {
        const io = getIo();
        io.emit('homeworkEvent-' + populatedHomework.schoolId, {
          action: 'homeworkUpdated', 
          data: { homework: populatedHomework }
        });
      }

      res.status(200).json(populatedHomework);
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

    const homeworkToDeleteRaw = await homeworkModel.find({ _id: { $in: homeworkIds } }).lean();
    if (homeworkToDeleteRaw.length === 0) {
      return res.status(404).json({ message: 'No homework found' });
    }
    const homeworkToDelete = await attachHomeworkEnrollments(homeworkToDeleteRaw);

    // Fetch comments for delete
    const allCommentsToDelete = await homeworkCommentModel.find({ homeworkId: { $in: homeworkIds } }).lean();
    deleteCommentAttachments(allCommentsToDelete);

    // --- Cloudinary
    for (const homework of homeworkToDelete) {
      if (homework.attachment?.fileName) {
        await cloudinary.uploader.destroy(homework.attachment.fileName).catch(err => 
          console.error('Error deleting homework attachment:', err)
        );
      }
    }

    await Promise.all([
      homeworkCommentModel.deleteMany({ homeworkId: { $in: homeworkIds } }),
      homeworkEnrollmentModel.deleteMany({ homeworkId: { $in: homeworkIds } }),
      homeworkModel.deleteMany({ _id: { $in: homeworkIds } })
    ]);

    res.status(200).json(homeworkToDelete);

    const io = getIo();
    homeworkToDelete.forEach(homework => {
      if (homework?.schoolId) {
        io.emit('homeworkEvent-' + homework.schoolId, { 
          action: 'homeworkDeleted', 
          data: { homework } 
        });
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

    if (!studentId || !homeworkItemId) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const homeworkItem = await homeworkModel.findById(homeworkItemId).lean();
    if (!homeworkItem) {
      return res.status(404).json({ message: 'Homework item not found' });
    }

    const commentsToDelete = await homeworkCommentModel.find({ homeworkId: homeworkItemId, studentId: studentId }).lean();
    deleteCommentAttachments(commentsToDelete);

    await Promise.all([
      homeworkEnrollmentModel.deleteOne({ homeworkId: homeworkItemId, studentId: studentId }),
      homeworkCommentModel.deleteMany({ homeworkId: homeworkItemId, studentId: studentId })
    ]);

    const populatedHomework = await attachHomeworkEnrollments(homeworkItem);
    res.status(200).json(populatedHomework);

    if (populatedHomework.schoolId) {
      const io = getIo();
      io.emit('homeworkEvent-' + populatedHomework.schoolId, {
        action: 'homeworkUpdated', 
        data: { homework: populatedHomework }
      });
    }
  } catch (error) {
    console.error("Error removing student from Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const deletedHomeworkRaw = await homeworkModel.findByIdAndDelete(homeworkId).lean();
    
    if (deletedHomeworkRaw) {
      const deletedHomework = await attachHomeworkEnrollments(deletedHomeworkRaw);

      const commentsToDelete = await homeworkCommentModel.find({ homeworkId }).lean();
      deleteCommentAttachments(commentsToDelete);

      await Promise.all([
        homeworkCommentModel.deleteMany({ homeworkId }),
        homeworkEnrollmentModel.deleteMany({ homeworkId })
      ]);

      // --- Cloudinary:
      if (deletedHomework.attachment?.fileName) {
        await cloudinary.uploader.destroy(deletedHomework.attachment.fileName).catch(err =>
          console.error('Error deleting homework attachment:', err)
        );
      }

      res.status(200).json(deletedHomework);

      if (deletedHomework?.schoolId) {
        const io = getIo();
        io.emit('homeworkEvent-' + deletedHomework.schoolId, {
          action: 'homeworkDeleted', 
          data: { homework: deletedHomework }
        });
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

    if (userType === 'student') {
      const incompleteCount = await homeworkEnrollmentModel.countDocuments({
        studentId: userId,
        completed: false
      });
      return res.json({ count: incompleteCount });
    }

    if (userType === 'teacher') {
      const pipeline = [
        { $match: { assignedTeacherId: userId } },
        {
          $lookup: {
            from: 'homeworkcommentmodels', 
            localField: '_id',
            foreignField: 'homeworkId',
            as: 'comments'
          }
        },
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
        { 
          $match: { 
            'latestComment.commentType': 'submission' 
          } 
        },
        { $count: 'total' }
      ];

      const result = await homeworkModel.aggregate(pipeline);
      const count = result.length > 0 ? result[0].total : 0;
      
      return res.json({ count });
    }

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
    const query = { homeworkId: { $in: idArray } };

    if (studentId) {
      query.studentId = studentId;
    }

    const comments = await homeworkCommentModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();

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
      
    const homeworkRaw = await homeworkModel.findById(homeworkId).lean();
    if (!homeworkRaw) {
      return res.status(404).json({ error: 'Homework not found' });
    }

    const commentDoc = new homeworkCommentModel({ homeworkId, ...newComment });
    if (newComment.attachment?.url && req.body.schoolId) {
      const attachment = await cloudinary.uploader.upload(newComment.attachment.url, { 
        folder: `${req.body.schoolId}/homework-comment-attachments` 
      });
      commentDoc.attachment = { url: attachment.url, fileName: attachment.public_id };
    }
    await commentDoc.save();

    // Directly alter specific standalone record state on feedback confirmation
    if (newComment.commentType.toLowerCase() === 'feedback') {
      await homeworkEnrollmentModel.updateOne(
        { homeworkId, studentId: newComment.studentId },
        { $set: { completed: (newComment.pass === true) } }
      );
    }

    // Add telemetry logs
    if (newComment.commentType === 'feedback' && newComment.duration > 0) {
      await createStudentStat({
        studentId: newComment.studentId, 
        activityType: 'homework',
        minutes: newComment.duration,
        date: Date.now(),
        comment: `homework item: ${homeworkRaw.name}`,
        referenceId: homeworkRaw._id,
      });
    }

    const updatedHomework = await attachHomeworkEnrollments(homeworkRaw);
    res.status(201).json({ comment: commentDoc, homework: updatedHomework });

    if (updatedHomework.schoolId) {
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
      
    const homeworkRaw = await homeworkModel.findById(homeworkId).lean();
    if (!homeworkRaw) {
      return res.status(404).json({ error: 'Homework not found' });
    }
  
    const commentToUpdate = await homeworkCommentModel.findOne({
      homeworkId,
      commentType: { $regex: new RegExp(`^${newComment.commentType}$`, 'i') },
      ...(newComment.commentType.toLowerCase() === 'submission' ? { studentId: newComment.studentId } : { teacherId: newComment.teacherId })
    }).sort({ createdAt: -1 });

    if (!commentToUpdate) return res.status(404).json({ error: 'Comment not found' });

    Object.assign(commentToUpdate, newComment);
    await commentToUpdate.save();
  
    if (newComment.commentType.toLowerCase() === 'feedback') {
      await homeworkEnrollmentModel.updateOne(
        { homeworkId, studentId: newComment.studentId },
        { $set: { completed: (newComment.pass === true) } }
      );
    }

    const updatedHomework = await attachHomeworkEnrollments(homeworkRaw);
    res.status(201).json({ comment: commentToUpdate, homework: updatedHomework });

    if (updatedHomework.schoolId) {
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
      
    const homeworkRaw = await homeworkModel.findById(homeworkId).lean();
    if (!homeworkRaw) {
      return res.status(404).json({ error: 'Homework not found' });
    }
  
    const commentToDeleteDoc = await homeworkCommentModel.findOne({
      homeworkId,
      commentType: { $regex: new RegExp(`^${commentToDelete.commentType}$`, 'i') },
      ...(commentToDelete.commentType.toLowerCase() === 'submission' ? { studentId: commentToDelete.studentId } : { teacherId: commentToDelete.teacherId })
    }).sort({ createdAt: -1 });

    if (!commentToDeleteDoc) return res.status(404).json({ error: 'Comment not found' });

    if (commentToDeleteDoc.attachment?.fileName) {
      await cloudinary.uploader.destroy(commentToDeleteDoc.attachment.fileName).catch(err => 
        console.error('Error removing comment attachment asset:', err)
      );
    }
    await homeworkCommentModel.findByIdAndDelete(commentToDeleteDoc._id);
  
    if (commentToDelete.commentType.toLowerCase() === 'feedback') {
      await homeworkEnrollmentModel.updateOne(
        { homeworkId, studentId: commentToDelete.studentId },
        { $set: { completed: false } }
      );
    }

    const updatedHomework = await attachHomeworkEnrollments(homeworkRaw);
    res.status(201).json({ comment: commentToDeleteDoc, homework: updatedHomework });

    if (updatedHomework.schoolId) {
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

/**
 * ====================================================================
 * POPULATE HOMEWORK WITH ENROLLMENTS BEFORE RETURNING
 * ====================================================================
 */
async function attachHomeworkEnrollments(homeworkOrHomeworks) {
  if (!homeworkOrHomeworks) return homeworkOrHomeworks;

  const isArray = Array.isArray(homeworkOrHomeworks);
  
  let homeworkList = isArray 
    ? homeworkOrHomeworks.map(h => (typeof h.toObject === 'function' ? h.toObject() : h))
    : [typeof homeworkOrHomeworks.toObject === 'function' ? homeworkOrHomeworks.toObject() : homeworkOrHomeworks];

  const homeworkIds = homeworkList.map(h => h._id);

  const enrollments = await homeworkEnrollmentModel.find({ homeworkId: { $in: homeworkIds } }).lean();

  const enrollmentsMap = enrollments.reduce((acc, enrollment) => {
    const hId = enrollment.homeworkId.toString();
    if (!acc[hId]) acc[hId] = [];
    
    acc[hId].push({
      studentId: enrollment.studentId,
      completed: enrollment.completed
    });
    return acc;
  }, {});

  homeworkList.forEach(h => {
    h.students = enrollmentsMap[h._id.toString()] || [];
  });

  return isArray ? homeworkList : homeworkList[0];
}

module.exports = router;