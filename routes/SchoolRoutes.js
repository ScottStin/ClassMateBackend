const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });

const schoolModel = require('../models/school-models');
const userModel = require('../models/user-models');
/**
 * ==============================
 *  Get all schools:
 * ==============================
*/

router.get('/', async (req, res) => {
  try {
    const schools = await schoolModel.find();
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
    if (req.body.logoPrimary) {
      try {
        const result = await cloudinary.uploader.upload(req.body.logoPrimary.url, { folder: 'Class E' });
        newSchool.logoPrimary = { url: result.url, filename: result.public_id };
        await newSchool.save();
      } catch (error) {
        console.error("Error uploading primary school logo to Cloudinary:", error);
      }
    }

    if (req.body.logoSecondary) {
      try {
        const result = await cloudinary.uploader.upload(req.body.logoSecondary.url, { folder: 'Class E' });
        newSchool.logoSecondary = { url: result.url, filename: result.public_id };
        await newSchool.save();
      } catch (error) {
        console.error("Error uploading secondary school logo to Cloudinary:", error);
      }
    }

    if (createdSchool) {

        // Create a new user
        const userDetails = {
          name: req.body.name,
          userType: 'school',
          schoolId: createdSchool._id,
          email: req.body.email,
          hashedPassword: hashedPassword,
          profilePicture: newSchool.logoPrimary ?? null 
        }
        const newUser = await new userModel(userDetails);
        const createdUser = await newUser.save();
  
        // Ensure user is created before proceeding
        if (!createdUser) {
          await createdSchool.remove(); // Rollback: delete the school
          
          console.log('school deleted');
          return res.status(500).send("Internal Server Error");
        }
  
        console.log(newUser);  
        res.status(201).json(createdUser);
    } else {
      res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * ==============================
 *  Update School:
 * ==============================
*/

router.patch('/:id', async (req, res) => {
  try {
    // Constructing an object with only the fields that need to be updated
    const updateFields = {};
    for (const key in req.body) {
      if (req.body.hasOwnProperty(key)) {
        updateFields[key] = req.body[key];
      }
    }

    const updatedSchool = await schoolModel.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );

    if (updatedSchool) {
      const schoolAdminUser = await userModel.findOne({ schoolId: req.params.id, userType: 'school' });

      // Update user details
      if (schoolAdminUser) {
        const updatedUser = await userModel.findByIdAndUpdate(
          schoolAdminUser._id,
          {
            $set: {
              name: req.body.name,
              email: req.body.email,
              profilePicture: updatedSchool.logoPrimary ?? null
            }
          },
          { new: true }
        );

        console.log(updatedUser);
        res.status(201).json({school: updatedSchool, user: updatedUser});
      } else {
        res.status(404).send('School admin user not found');
      }
    } else {
      res.status(404).send('School not found');
    }
  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * ==============================
 *  Delete School:
 * ==============================
*/

router.delete('/:id', async (req, res) => {
  try {
    console.log(req);
    const deleteSchool = await schoolModel.findByIdAndDelete(
      req.params.id,
    );
    console.log(deleteSchool);

    if (!deleteSchool) {
      return res.status(404).send('School not found');
    }

    res.status(201).json(deleteSchool);
  } catch (error) {
    console.error('Error deleting school:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;