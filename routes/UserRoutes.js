const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const bcrypt = require("bcrypt");

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

router.post('/', async (req, res) => {
  try {
    const newUser = new userModel(req.body);
    newUser.hashedPassword = await bcrypt.hash(newUser.unhashedPassword, 12 , async () => {
      await newUser.save();    
      res.status(200).send(newUser); 
    })

  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;