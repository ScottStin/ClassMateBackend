const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const { getIo } = require('../socket-io');
const Stripe = require('stripe');

const userModel = require('../models/user-models');
const packageModel = require('../models/package-model');
const { courseworkModel } = require('../models/coursework-model');
const examModel = require('../models/exam-model');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16' // or latest version
});

/**
 * ==============================
 *  Get packages:
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

router.get('/find-one', async (req, res) => {
  try {
    const { packageId } = req.query;

    if (!packageId) {
      return res.status(400).json({ error: 'packageId is required' });
    }

    const pkg = await packageModel.findById(packageId);
    
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json(pkg);
  } catch (error) {
    console.error("Error getting package:", error);
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
    const newPackage = new packageModel(req.body);
    let createdPackage = await newPackage.save();

    if (!createdPackage) {
      return res.status(500).send("Internal Server Error");
    }

    // --- create stripe subscription ids if package.type === subscription:
    if (createdPackage.type === "subscription") {
      if (!createdPackage.subscriptionFrequency) {
        await packageModel.findByIdAndDelete(createdPackage._id);
        return res.status(400).json({
          message: "subscriptionFrequency is required for subscription packages"
        });
      }

      const intervalMap = {
        weekly: "week",
        monthly: "month",
        yearly: "year"
      };

      const stripeInterval = intervalMap[createdPackage.subscriptionFrequency];

      if (!stripeInterval) {
        await packageModel.findByIdAndDelete(createdPackage._id);
        return res.status(400).json({
          message: "Invalid subscriptionFrequency"
        });
      }

      const stripeProduct = await stripe.products.create({
        name: createdPackage.name,
        description: createdPackage.description,
        metadata: {
          packageId: createdPackage._id.toString(),
          schoolId: createdPackage.schoolId
        }
      });

      const stripePrice = await stripe.prices.create({
        unit_amount: Math.round(createdPackage.price * 100),
        currency: createdPackage.stripeCurrency || "usd",
        recurring: {
          interval: stripeInterval
        },
        product: stripeProduct.id,
        metadata: {
          packageId: createdPackage._id.toString(),
          schoolId: createdPackage.schoolId
        }
      });

      createdPackage.stripeProductId = stripeProduct.id;
      createdPackage.stripePriceId = stripePrice.id;
      createdPackage = await createdPackage.save();
    }

    // --- upload package photo to cloudinary (todo - replace with file service):
    try {
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

    // --- emit socket event:
    if (createdPackage) {
      const io = getIo();
      io.emit('packageEvent-' + createdPackage.schoolId, {action: 'packageCreated', data: createdPackage});
    }
    
  res.status(201).json(createdPackage);
 
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

router.patch('update-package/:id', async (req, res) => {
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

    // --- emit socket event:
    if (updatedPackage) {
      const io = getIo();
      io.emit('packageEvent-' + updatedPackage.schoolId, {action: 'packageUpdated', data: updatedPackage});
    }
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * ==============================
 *  Update subscription end date:
 * ==============================
*/

router.patch('/update-sub-package-cancel-end-date/:id', async (req, res) => {
  try {
    const { studentId } = req.body;
    const packageId = req.params.id;

    if (!studentId) {
      return res.status(400).send('Missing studentId');
    }

    const updatedPackage = await packageModel.findOneAndUpdate(
      { _id: packageId },
      { 
        // Use the filtered positional operator to update all matching elements
        $set: { "studentsEnrolled.$[elem].endDate": new Date() } 
      },
      { 
        // Define the filter for which elements in the array to update
      arrayFilters: [{ 
        "elem.studentId": studentId, 
        "elem.endDate": null // Only update if the enrollment is currently "open"
        }],
        new: true 
      }
    );

    if (!updatedPackage) {
      return res.status(404).send('Package not found');
    }

    // --- emit socket event:
    const io = getIo();
    io.emit('packageEvent-' + updatedPackage.schoolId, {
      action: 'packageUpdated', 
      data: updatedPackage
    });

    res.json({ success: true, data: updatedPackage });

  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * ==============================
 *  Enrol student in package:
 * ==============================
*/

router.patch('/enrol-student/:id', async (req, res) => {
  try {
    const { studentId, pack } = req.body;
    const io = getIo();

    if (!studentId) {
      return res.status(400).json({
        message: 'studentId is required'
      });
    }

    // --- add student to package:
    const updatedPackage = await packageModel.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          studentsEnrolled: {
            studentId,
            startDate: new Date(),
            endDate: null
          }
        }
      },
      { new: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({
        message: 'Package not found'
      });
    }

    // --- add student class hours
    if(pack.type === 'one-time-payment' && Number(pack.classHours) > 0) {
      const student = await userModel.findOne({ _id: studentId });
      student.bulkPaymentClassHours = (Number(student.bulkPaymentClassHours) ?? 0) + Number(pack.classHours)
      await student.save();

    if (student) {
      io.emit('authStoreEvent-' + studentId, { action: 'currentUserUpdated', data: student });
    }
    } // todo - add subscription


    // --- enrol student in courses:
    if(pack.courseIds?.length > 0) {
      for(const corseId of pack.courseIds) {
        const course = await courseworkModel.findById(corseId);
        if (course.studentsEnrolled.includes(studentId)) {
          continue
        }
        course.studentsEnrolled.push(studentId);

        await course.save();

        if(course?.schoolId) {
          io.emit('courseEvent-' + course.schoolId, {action: 'courseUpdated', data: course});
        }
      }
    }

    // --- enrol student in exams:
    if(pack.examIds?.length > 0) {
      for(const examId of pack.examIds) {
        const exam = await examModel.findById(examId);
        if (exam.studentsEnrolled.includes(studentId)) {
          continue
        }
        exam.studentsEnrolled.push(studentId);

        await exam.save();

        if(exam?.schoolId) {
          io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
        }
      }
    }

    // --- emit socket event:
    if (updatedPackage) {
      // const io = getIo();
      io.emit('packageEvent-' + updatedPackage.schoolId, {action: 'packageUpdated', data: updatedPackage});
    }

    res.status(200).json(updatedPackage);
  } catch (error) {
    console.error('Error enrolling student in package:', error);
    res.status(500).json({
      message: 'Internal Server Error'
    });
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

    // --- emit socket event:
    if (deletedPackage) {
      const io = getIo();
      io.emit('packageEvent-' + deletedPackage.schoolId, {action: 'packageDeleted', data: deletedPackage});
    }
    res.status(201).json(deletedPackage);
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).send('Internal Server Error');
  }
});


module.exports = router;
