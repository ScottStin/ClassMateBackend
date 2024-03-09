const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });

const schoolModel = require('../models/school-models');

/**
 * ==============================
 *  Get all schools:
 * ==============================
*/

router.get('/', async (req, res) => {
  try {
    const schools = await schoolModel.find();
    console.log(schools);
    res.json(schools);
  } catch (error) {
    console.error("Error getting schools:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * ==============================
 *  Create new school:
 * ==============================
*/

router.post('/', async (req, res) => {
  console.log(req.body);
  try {
    // Check if a school with the provided name already exists
    const existingSchoolName = await schoolModel.findOne({ name: { $regex: new RegExp("^" + req.body.name, "i") } });
    if (existingSchoolName) {
      return res.status(400).json({ error: "School with this name already exists." });
    }

    // Check if a school with the provided email already exists
    const existingSchoolEmail = await schoolModel.findOne({ email: { $regex: new RegExp("^" + req.body.email, "i") } });
    if (existingSchoolEmail) {
      return res.status(400).json({ error: "School with this email already exists." });
    }

    // If not, proceed to create a new school
    const hashedPassword = await bcrypt.hash(req.body.unhashedPassword, 12);
    const newSchool = new schoolModel(req.body);
    newSchool.hashedPassword = hashedPassword;
    const createdSchool = await newSchool.save();

    // Logo upload
    if (req.body.logo) {
      try {
        const result = await cloudinary.uploader.upload(req.body.logo.url, { folder: 'Class E' });
        newSchool.logo = { url: result.url, filename: result.public_id };
        await newSchool.save();
      } catch (error) {
        console.error("Error uploading logo to Cloudinary:", error);
      }
    }

    if (createdSchool) {
      res.status(201).json(createdSchool);
    } else {
      res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;