const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");

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
    console.log('hit1');
    console.log(req.body);
  try {
    const hashedPassword = await bcrypt.hash(req.body.unhashedPassword, 12)
    const newSchool = await new schoolModel(req.body);
    newSchool.hashedPassword = hashedPassword;
    const createdSchool = await newSchool.save();
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