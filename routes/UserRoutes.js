const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');

const userModel = require('../models/user-models');
// const examModel = require('../models/exam-model.js');

router.get('/', async (req, res) => {
  try {
    const users = await userModel.find();
    res.json(users);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// router.post('/login', async (req, res) => {
//   try {
//     const user = await userModel.findOne({ email: req.body.email });
//     const validPassword = await bcrypt.compare(req.body.password, user.hashedPassword);
//     if (!user || !validPassword) {
//       return res.status(401).json({ error: 'Authentication failed. Email or password incorrect.' });
//     }

//     const token = jwt.sign(
//       { userId: user._id, email: user.email },
//       'placeholderKey', // process.env.JWT_SECRET, // Replace with secret key
//       { expiresIn: '12h' }
//     );
//     res.status(200).json({ token, userId: user._id });

//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

router.post('/', upload.single('profilePic'), async (req, res) => {
  try {
    const image = cloudinary.uploader.upload(req.body.profilePicture, { folder: 'Class E' }, async (err, result) => {
      if (err) {
        return console.log(err);
      }

      const newUser = new userModel(req.body);
      newUser.profilePicture = { url: result.url, filename: result.public_id };
      newUser.hashedPassword = await bcrypt.hash(newUser.unhashedPassword, 12);
      
      console.log(newUser);
      await newUser.save();
      console.log("New User:", newUser);
      
      res.status(200).send(newUser);
    });

    // if (req.body.userType === 'Student') {
    //   const currentDefaultExam = await examModel.findOne({ defaultWelcomeExam: true });
    //   currentDefaultExam.studentEnrolled.push({ studentEmail: req.body.email, studentName: req.body.name });
    //   await currentDefaultExam.save();
    // }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;