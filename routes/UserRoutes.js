const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
const { getIo } = require('../socket-io');
const crypto = require('crypto');

const { examModel, examEnrollmentModel, examCompletionModel } = require('../models/exam-model');
const { questionSubmissionModel} = require('../models/question-model');
const userModel = require('../models/user-models');
const {homeworkCommentModel, homeworkEnrollmentModel} = require('../models/homework-model');
const {courseworkEnrollmentModel, courseworkCompletionModel} = require('../models/coursework-model');
const schoolModel = require('../models/school-models');

/**
 * ==============================
 *  Get all Users:
 * ==============================
*/

router.get('/', async (req, res) => {
  try {
    // Extract the currentSchoolId from the query parameters
    const currentSchoolId = req.query.currentSchoolId;

    // If currentSchoolId is provided, filter users by schoolId
    let filter = {};
    if (currentSchoolId) {
      filter = { schoolId: currentSchoolId };
    }

    // Find users based on the filter
    const users = await userModel.find(filter);

    // Send the filtered users as the response
    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * ==============================
 *  Create new user:
 * ==============================
*/

router.post('/', async (req, res) => {

  try {
    // --- hash password and create new user:
    const hashedPassword = await bcrypt.hash(req.body.unhashedPassword, 12);
    const newUser = await new userModel(req.body);
    newUser.hashedPassword = hashedPassword;
    const createdUser = await newUser.save();
    
    if (createdUser) {
      try {
        // --- enroll new users in default exam:
        if (createdUser.userType === 'student') {
          const exam = await examModel.findOne({ default: true });
          if (!exam) {
            return res.status(404).json('Default exam not found');
          }
          
          const userId = createdUser._id.toString();
          
          // Check for existing enrollment in the new relational model
          const existingEnrollment = await examEnrollmentModel.findOne({ 
            examId: exam._id, 
            studentId: userId 
          });

          if (existingEnrollment) {
            return res.status(400).json('User has already signed up for this exam');
          }
      
          // Create new enrollment document
          const newEnrollment = new examEnrollmentModel({
            examId: exam._id,
            studentId: userId
          });
          await newEnrollment.save();
        }

        // --- add trial class minutes:
        const school = await schoolModel.findOne({ _id: req.body.schoolId });
        if (!school) {
          return res.status(404).json('School not found');
        }
        
        createdUser.bulkPaymentClassHours = (school.freeInitClassHours ?? 0) / 60;
        await createdUser.save();

        // --- upload user photo to cloudinary:
        if (createdUser.profilePicture?.url) {
          const result = await cloudinary.uploader.upload(createdUser.profilePicture.url, {
            folder: `${createdUser.schoolId}/user-profile-pictures`
          });
          createdUser.profilePicture = { url: result.url, fileName: result.public_id };
          await createdUser.save();
        }

        return res.status(201).json(createdUser);
        
      } catch (error) {
        console.error("Inner error:", error);
        return res.status(500).send("Internal Server Error"); 
      }
    } else {
      return res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Update user:
 * ==============================
*/

router.patch('/:id', async (req, res) => {
  try {
    // Exclude the profile picture property from the update
    const { profilePicture, unhashedPassword, ...updatedFields } = req.body;

    if (unhashedPassword && unhashedPassword !== '') {
      updatedFields.hashedPassword = await bcrypt.hash(unhashedPassword, 12);
    }

    // get original user before updating:
    const nonUpdatedUser = await userModel.findOne({ _id: req.params.id });

    // Update user:
    const updatedUser = await userModel.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).send('User not found');
    }

    // Update profile picture in cloud service:
    if(profilePicture) {
      const image = await cloudinary.uploader.upload(req.body.profilePicture.url, {folder: `${updatedUser.schoolId}/user-profile-pictures`}, async (err, result)=>{
        if (err) return console.error(err);        
        updatedUser.profilePicture = {url:result.url, fileName:result.public_id};
        await updatedUser.save();
        if (image && req.body.previousProfilePicture) {
          try {
            const { fileName } = req.body.previousProfilePicture;
            await cloudinary.uploader.destroy(fileName, (err, result) => {
              if (err) console.error('Error deleting previous profile picture:', err);
            });
          } catch (err) {
            console.error('Error deleting cloudinary link:', err);
          }
      }
      })
    }
    res.status(201).json(updatedUser);

    // --- Socket Events:
    const io = getIo();
    console.log('authStoreEvent-' + updatedUser._id)
    io.emit('authStoreEvent-' + updatedUser._id, {action: 'currentUserUpdated', data: updatedUser});
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * ==============================
 *  Delete user:
 * ==============================
*/

router.delete('/:id', async (req, res) => {
  try {
    const deletedUser = await userModel.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).send('User not found');
    }
    
    // --- Remove profile picture:
    if(deletedUser.profilePicture?.url) {
      const { fileName } = deletedUser.profilePicture;
      await cloudinary.uploader.destroy(fileName, (err, result) => {
        if (err) console.error('Error deleting profile picture:', err);
      });
    }

    const userIdStr = deletedUser._id.toString();

    // --- 1. Delete user's question submissions ---
    await questionSubmissionModel.deleteMany({ studentId: userIdStr });

    // --- 2. Delete user from exams (Enrollments & Completions) ---
    await examEnrollmentModel.deleteMany({ studentId: userIdStr });
    await examCompletionModel.deleteMany({ studentId: userIdStr });

    // --- 3. Delete user from homework (Enrollments & Comments) ---
    await homeworkEnrollmentModel.deleteMany({ studentId: userIdStr });
    await homeworkCommentModel.deleteMany({ studentId: userIdStr });

    // --- 4. Delete user from coursework (Enrollments & Completions) ---
    await courseworkEnrollmentModel.deleteMany({ studentId: userIdStr });
    await courseworkCompletionModel.deleteMany({ studentId: userIdStr });

    // // remove student from lessons:
    // await lessonModel.updateMany(
    // {},
    // {
    //   $pull: {
    //     studentsEnrolledIds: userIdStr,
    //     lessonStudentsAttended: userIdStr
    //   }
    // }
    // ) // note - let's not delete a user from the lesson, so we can track number of students enrolled in historical lessons

    // todo - add delete user from package history too.

    res.status(201).json(deletedUser);
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Internal Server Error');
  }
});
/**
 * ==============================
 *  Login:
 * ==============================
*/

router.post('/login', async (req, res) => {
  try {

    const user = await userModel.findOne({ email: req.body.user.email, schoolId: req.body.currentSchoolId });
    if (!user) {
      return res.status(401).json({ error: 'Authentication failed. Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(req.body.user.unhashedPassword, user.hashedPassword);
    if (!validPassword) {
      return res.status(401).json({ error: 'Authentication failed. Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
     'placeholderSecretKey', //process.env.JWT_SECRET, // Replace with secret key
      { expiresIn: '12h' }
    );
    res.status(200).json({ token, userId: user._id, user });

  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login-cm-admin-user', async (req, res) => {
  try {
    const { password } = req.body;
    const correctPassword = process.env.CM_ADMIN_USER_PASSWORD;

    if (!password || !correctPassword) {
      return res.status(401).json({
        error: 'Authentication failed.',
      });
    }

    const isValid =
      password.length === correctPassword.length &&
      crypto.timingSafeEqual(
        Buffer.from(password),
        Buffer.from(correctPassword)
      );

    if (!isValid) {
      return res.status(401).json({
        error: 'Authentication failed.',
      });
    }

    return res.status(200).json({
      success: true,
      role: 'cm-admin',
    });

  } catch (error) {
    console.error('Error logging in as CM admin user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
