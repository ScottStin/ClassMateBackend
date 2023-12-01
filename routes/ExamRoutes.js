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

router.delete('/:id', async (req, res) => {
    try {
      const deletedExam = await examModel.findByIdAndDelete(req.params.id);
      console.log(deletedExam);
      if (deletedExam) {
        res.status(200).json(deletedExam);
      } else {
        res.status(404).json({ message: "Exam not found" });
      }
    } catch (error) {
      console.error("Error deleting exam:", error);
      res.status(500).send("Internal Server Error");
    }
  });

module.exports = router;