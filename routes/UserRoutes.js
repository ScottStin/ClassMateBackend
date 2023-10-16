const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');

const userModel = require('../models/user-models');

router.get('/', async (req, res) => {
  try {
    const users = await userModel.find();
    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.unhashedPassword, 12)
    const newUser = await new userModel(req.body);
    newUser.hashedPassword = hashedPassword;
    await newUser.save();

  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send("Internal Server Error");
  }
});

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
