const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');

const examModel = require('../models/exam-model');
const userModel = require('../models/user-models');

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
    const hashedPassword = await bcrypt.hash(req.body.unhashedPassword, 12)
    const newUser = await new userModel(req.body);
    newUser.hashedPassword = hashedPassword;
    const createdUser = await newUser.save();
    if (createdUser) {
      try {
        const exam = await examModel.findOne({ default: true });
        if (!exam) {
          return res.status(404).json('Default exam not found');
        }
    
        const userEmail = createdUser.email;
    
        if (exam.studentsEnrolled.includes(userEmail)) {
          return res.status(400).json('User has already signed up for this exam');
        }
    
        exam.studentsEnrolled.push(userEmail);
        await exam.save();
      } catch (error) {
        res.status(500).send("Internal Server Error");
      }
    res.status(201).json(createdUser);
    } else {
      res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Update user:
 * ==============================
*/

router.patch('/:id', async (req, res) => {
  try {
    console.log(req.body)
    // Exclude the profilepicture property from the update
    const { profilePicture, ...updatedFields } = req.body;
  
    const updatedUser = await userModel.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).send('User not found');
    }
    if(profilePicture) {
      const image = await cloudinary.uploader.upload(req.body.profilePicture.url, {folder:'Class E'}, async (err, result)=>{
        if (err) return console.log(err);        
        updatedUser.profilePicture = {url:result.url, filename:result.public_id};
        await updatedUser.save();
        if (image && req.body.previousProfilePicture) {
          const { filename } = req.body.previousProfilePicture;
          await cloudinary.uploader.destroy(filename, (err, result) => {
            if (err) console.log('Error deleting previous profile picture:', err);
          });
        }
      })
    }
    res.status(201).json(updatedUser);
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
    const deletedUser = await userModel.findByIdAndDelete(
      req.params.id,
    );

    if (!deletedUser) {
      return res.status(404).send('User not found');
    }
    
    // Remove profile picture:
    if(deletedUser.profilePicture) {
      const { filename } = deletedUser.profilePicture;
      await cloudinary.uploader.destroy(filename, (err, result) => {
        if (err) console.log('Error deleting profile picture:', err);
      });
    }

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
    const user = await userModel.findOne({ email: req.body.email });
    const validPassword = await bcrypt.compare(req.body.unhashedPassword, user.hashedPassword);

    if (!user || !validPassword) {
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

module.exports = router;
