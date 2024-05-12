const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });

const homeworkModel = require('../models/homework-model');

router.get('/', async function (req, res) {
    try {
        // Extract the currentSchoolId from the query parameters
        const currentSchoolId = req.query.currentSchoolId;

        // If currentSchoolId is provided, filter homework by schoolId
        let filter = {};
        if (currentSchoolId) {
          filter = { schoolId: currentSchoolId };
        }

        // Find homework based on the filter
        const homework = await homeworkModel.find(filter);

        // Send the filtered homework as the response
        res.json(homework);
    } catch (error) {
        console.error("Error getting homework:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/', async (req, res) => {
  try {
    const newHomework = await new homeworkModel(req.body);
    const createdHomework = await newHomework.save();

    if (createdHomework && req.body.attachment && req.body.attachment?.url && req.body.attachment?.url !== '' && req.body.attachment?.fileName !== '') {
        const attachment = await cloudinary.uploader.upload(req.body.attachment.url, { folder: `${req.body.schoolId}/homework-attachments` });
        createdHomework.attachment = { url: attachment.url, fileName: attachment.public_id };
        await createdHomework.save();
    }
    
    res.status(201).json(createdHomework);
  } catch (error) {
    console.error("Error creating new homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/new-comment', async (req, res) => {
  try {
    const homeworkId = req.body.homeworkId;
    const newComment = req.body.feedback;
      
    const updatedHomework = await homeworkModel.findById(homeworkId);

    updatedHomework.comments.push(newComment);
    await updatedHomework.save();
  
    console.log('updatedHomework:');
    console.log(updatedHomework);

    if (!updatedHomework) {
      return res.status(404).json({ error: 'Homework not found' });
    }

    res.status(201).json(updatedHomework);
  } catch (error) {
    console.error("Error adding comment to homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deletedHomework = await homeworkModel.findByIdAndDelete(req.params.id);
    if (deletedHomework) {
      res.status(200).json(deletedHomework);
    } else {
      res.status(404).json({ message: "Homework not found" });
    }
  } catch (error) {
    console.error("Error deleting Homework:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;