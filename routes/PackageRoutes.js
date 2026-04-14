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
    // Extract the currentSchoolId from the query parameters
    const currentSchoolId = req.query.currentSchoolId;

    // If currentSchoolId is provided, filter packages by schoolId
    let filter = {};
    if (currentSchoolId) {
      filter = { schoolId: currentSchoolId };
    }

    // Find packages based on the filter
    const packages = await packageModel.find(filter);

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
    console.error("Error creating package:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Update package:
 * ==============================
*/

router.patch('/:id', async (req, res) => {
  try {
    // Exclude the profile picture property from the update
    const { packageCoverPhoto, ...updatedFields } = req.body;

    
    // get original package before updating:
    const nonUpdatedPackage = await packageModel.findOne({ _id: req.params.id });

    // Update package:
    const updatedPackage = await packageModel.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedPackage) {
      return res.status(404).send('Package not found');
    }

    // Update picture in cloud service:
    if(packageCoverPhoto) {
      const image = await cloudinary.uploader.upload(req.body.packageCoverPhoto.url, {folder: `${updatedPackage.schoolId}/package-cover-photos`}, async (err, result)=>{
        if (err) return console.log(err);        
        updatedPackage.packageCoverPhoto = {url:result.url, fileName:result.public_id};
        await updatedPackage.save();
        if (image && nonUpdatedPackage.packageCoverPhoto) {
          try {
            const { fileName } = nonUpdatedPackage.packageCoverPhoto;

            await cloudinary.uploader.destroy(fileName, (err, result) => {
              if (err) console.log('Error deleting previous cover picture:', err);
            });
          } catch (err) {
            console.error('Error deleting cloudinary link:', err);
          }
      }
      })
    }
    res.status(201).json(updatedPackage);
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).send('Internal Server Error');
  }
});


/**
 * ==============================
 *  Delete package:
 * ==============================
*/

router.delete('/:id', async (req, res) => {
  try {
    const deletedPackage = await packageModel.findByIdAndDelete(
      req.params.id,
    );

    if (!deletedPackage) {
      return res.status(404).send('Package not found');
    }
    
    // --- Remove profile picture:
    if(deletedPackage.packageCoverPhoto?.url) {
      const { fileName } = deletedPackage.packageCoverPhoto;
      await cloudinary.uploader.destroy(fileName, (err, result) => {
        if (err) console.log('Error deleting cover picture:', err);
      });
    }
    res.status(201).json(deletedPackage);
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).send('Internal Server Error');
  }
});


module.exports = router;
