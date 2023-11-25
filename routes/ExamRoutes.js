const express = require("express");
const router = express.Router();

const examModel = require('../models/exam-model');

router.get('/', async function (req, res) {
    try {
        await examModel.find()
        .then(exams => {res.json(exams)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting exams:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;