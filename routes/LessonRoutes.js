const express = require("express");
const router = express.Router();

const lessonModel = require('../models/lesson-model');

router.get('/', async function (req, res) {
    try {
        await lessonModel.find()
        .then(lessons => {res.json(lessons)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting lessons:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    await lessonModel.insertMany(req.body)
    .then(res=>{
        console.log(res)
    }).catch(err=>{
        console.log(err)
    })
  } catch (error) {
    console.error("Error creating new lessons:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
