const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const { getIo } = require('../socket-io');

const userModel = require('../models/user-models');
const packageModel = require('../models/package-model');


/**
 * ==============================
 *  Get all packages:
 * ==============================
*/

router.get('/', async (req, res) => {
  try {
    console.log('hit!')
    // Extract the currentSchoolId from the query parameters
    const currentSchoolId = req.query.currentSchoolId;

    // If currentSchoolId is provided, filter packages by schoolId
    let filter = {};
    if (currentSchoolId) {
      filter = { schoolId: currentSchoolId };
    }

    // Find packages based on the filter
    const packages = await packageModel.find(filter);

    console.log(packages);

    // Send the filtered packages as the response
    res.json(packages);
  } catch (error) {
    console.error("Error getting packages:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * ==============================
 *  Create new package:
 * ==============================
*/

router.post('/', async (req, res) => {
  try {
    console.log(req.body);
    const newPackage = await new packageModel(req.body);
    const createdPackage = await newPackage.save();
    
    if (createdPackage) {
      try {
        // --- upload package photo to cloudinary (todo - replace with file service):
        if(createdPackage.packageCoverPhoto?.url) {
          await cloudinary.uploader.upload(createdPackage.packageCoverPhoto.url, {folder: `${createdPackage.schoolId}/package-cover-photos`}, async (err, result)=>{
            if (err) return console.log(err);  
            createdPackage.packageCoverPhoto = {url:result.url, fileName:result.public_id};
            await createdPackage.save();
          })
        }
      } catch (error) {
        res.status(500).send("Internal Server Error");
      }
    res.status(201).json(createdPackage);
    } else {
      res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
