const express = require("express");
const router = express.Router();

const lessonTypeModel = require('../models/lesson-type-model');

router.get('/', async function (req, res) {
    try {
        await lessonTypeModel.find()
        .then(lessons => {res.json(lessons)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting lesson types:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;
