const express = require("express");
const router = express.Router();
const multer = require('multer');
const { cloudinary, storage } = require('../cloudinary');
const upload = multer({ storage });
const { getIo } = require('../socket-io');
const Stripe = require('stripe');
const { cancelStudentSubscription } = require('./BillingRoutes');


const userModel = require('../models/user-models');
const {packageModel, packageEnrolmentModel } = require('../models/package-model');
const { courseworkModel, courseworkEnrollmentModel } = require('../models/coursework-model');
const { examModel, examEnrollmentModel } = require('../models/exam-model');

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
    const currentSchoolId = req.query.currentSchoolId;

    let filter = {};
    if (currentSchoolId) {
      filter = { schoolId: currentSchoolId };
    }

    // Find packages and convert them directly to plain JSON objects via .lean()
    const packages = await packageModel.find(filter).lean();

    // Dynamically inject the enrollments to support legacy frontend models
    const populatedPackages = await attachPackageEnrollments(packages);

    res.json(populatedPackages);
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

    const pkg = await packageModel.findById(packageId).lean();
    
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Inject the studentsEnrolled  before sending it to the frontend
    const populatedPkg = await attachPackageEnrollments(pkg);

    res.json(populatedPkg);
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
        return res.status(400).json({ message: "subscriptionFrequency is required" });
      }

      const intervalMap = { weekly: "week", monthly: "month", yearly: "year" };
      const stripeInterval = intervalMap[createdPackage.subscriptionFrequency];

      if (!stripeInterval) {
        await packageModel.findByIdAndDelete(createdPackage._id);
        return res.status(400).json({ message: "Invalid subscriptionFrequency" });
      }

      const stripeProduct = await stripe.products.create({
        name: createdPackage.name,
        description: createdPackage.description,
        metadata: { packageId: createdPackage._id.toString(), schoolId: createdPackage.schoolId }
      });

      const stripePrice = await stripe.prices.create({
        unit_amount: Math.round(createdPackage.price * 100),
        currency: createdPackage.stripeCurrency || "usd",
        recurring: { interval: stripeInterval },
        product: stripeProduct.id,
        metadata: { packageId: createdPackage._id.toString(), schoolId: createdPackage.schoolId }
      });

      createdPackage.stripeProductId = stripeProduct.id;
      createdPackage.stripePriceId = stripePrice.id;
      await createdPackage.save();
    }

    // --- upload package photo using clear Promise syntax
    if (createdPackage.packageCoverPhoto?.url) {
      try {
        const result = await cloudinary.uploader.upload(createdPackage.packageCoverPhoto.url, {
          folder: `${createdPackage.schoolId}/package-cover-photos`
        });
        createdPackage.packageCoverPhoto = { url: result.url, fileName: result.public_id };
        await createdPackage.save();
      } catch (cloudinaryError) {
        console.error("Cloudinary upload failed:", cloudinaryError);
        // non-fatal error, let creation continue or handle as preferred
      }
    }

    // Convert to lean object now that all operations are completed
    const plainPackage = createdPackage.toObject();
    const populatedPackage = await attachPackageEnrollments(plainPackage);

    const io = getIo();
    io.emit('packageEvent-' + populatedPackage.schoolId, { action: 'packageCreated', data: populatedPackage });
    
    res.status(201).json(populatedPackage);
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

router.patch('/update-package/:id', async (req, res) => {
  try {
    const { packageCoverPhoto, ...updatedFields } = req.body;
    const nonUpdatedPackage = await packageModel.findOne({ _id: req.params.id });

    let updatedPackage = await packageModel.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    ).lean();

    if (!updatedPackage) {
      return res.status(404).send('Package not found');
    }

    // --- Handle photo update cleanly using modern async/await execution flow
    if (packageCoverPhoto) {
      try {
        const result = await cloudinary.uploader.upload(packageCoverPhoto.url, {
          folder: `${updatedPackage.schoolId}/package-cover-photos`
        });

        // Write to DB
        await packageModel.findByIdAndUpdate(updatedPackage._id, {
          $set: { packageCoverPhoto: { url: result.url, fileName: result.public_id } }
        });

        // Mutate local object copy
        updatedPackage.packageCoverPhoto = { url: result.url, fileName: result.public_id };

        // Clean up historic assets
        if (nonUpdatedPackage?.packageCoverPhoto?.fileName) {
          await cloudinary.uploader.destroy(nonUpdatedPackage.packageCoverPhoto.fileName).catch(err => 
            console.error('Error destroying old image:', err)
          );
        }
      } catch (cloudinaryError) {
        console.error("Cloudinary patching failed:", cloudinaryError);
      }
    }

    const populatedPackage = await attachPackageEnrollments(updatedPackage);
    
    const io = getIo();
    io.emit('packageEvent-' + populatedPackage.schoolId, { action: 'packageUpdated', data: populatedPackage });
    
    res.status(201).json(populatedPackage);
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

    await packageEnrolmentModel.updateMany(
      { packageId: packageId, studentId: studentId, endDate: null },
      { $set: { endDate: new Date() } }
    );

    const updatedPackageRaw = await packageModel.findById(packageId).lean();

    if (!updatedPackageRaw) {
      return res.status(404).send('Package not found');
    }

    // socket emit:
    const populatedPackage = await attachPackageEnrollments(updatedPackageRaw);

    const io = getIo();
    io.emit('packageEvent-' + populatedPackage.schoolId, {
      action: 'packageUpdated', 
      data: populatedPackage
    });

    res.json({ success: true, data: populatedPackage });

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

    // 1. Add student to standalone package enrollment collection using upsert protection
    await packageEnrolmentModel.create({
      packageId: req.params.id,
      studentId: studentId,
      startDate: new Date(),
      endDate: null
    });

    const updatedPackageRaw = await packageModel.findById(req.params.id).lean();

    if (!updatedPackageRaw) {
      return res.status(404).json({
        message: 'Package not found'
      });
    }

    // --- add student class hours
    if(pack.type === 'one-time-payment' && Number(pack.classHours) > 0) {
      const student = await userModel.findOne({ _id: studentId });
      if (student) {
        student.bulkPaymentClassHours = (Number(student.bulkPaymentClassHours) ?? 0) + Number(pack.classHours);
        await student.save();
        io.emit('authStoreEvent-' + studentId, { action: 'currentUserUpdated', data: student });
      }
    }

    // 2. Enrol student in courses via standalone relationship model
    if(pack.courseIds?.length > 0) {
      for(const courseId of pack.courseIds) {
        await courseworkEnrollmentModel.findOneAndUpdate(
          { courseworkId: courseId, studentId: studentId },
          { $setOnInsert: {} },
          { upsert: true }
        );

        const course = await courseworkModel.findById(courseId).lean();
        if (course) {
          // Reassemble legacy flat-string array for frontend consumer expectation
          const courseEnrols = await courseworkEnrollmentModel.find({ courseworkId: courseId }).lean();
          course.studentsEnrolled = courseEnrols.map(e => e.studentId);

          if(course.schoolId) {
            io.emit('courseEvent-' + course.schoolId, {action: 'courseUpdated', data: course});
          }
        }
      }
    }

    // 3. Enrol student in exams via standalone relationship model
    if(pack.examIds?.length > 0) {
      for(const examId of pack.examIds) {
        await examEnrollmentModel.findOneAndUpdate(
          { examId: examId, studentId: studentId },
          { $setOnInsert: {} },
          { upsert: true }
        );

        const exam = await examModel.findById(examId).lean();
        if (exam) {
          // Reassemble legacy flat-string array for frontend consumer expectation
          const examEnrols = await examEnrollmentModel.find({ examId: examId }).lean();
          exam.studentsEnrolled = examEnrols.map(e => e.studentId);

          if(exam.schoolId) {
            io.emit('examEvent-' + exam.schoolId, {action: 'examUpdated', data: exam});
          }
        }
      }
    }

    // 4. Wrap up payload seamlessly
    const populatedPackage = await attachPackageEnrollments(updatedPackageRaw);
    
    if (populatedPackage) {
      io.emit('packageEvent-' + populatedPackage.schoolId, {action: 'packageUpdated', data: populatedPackage});
    }

    res.status(200).json(populatedPackage);
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
    const packageToDelete = await packageModel.findById(req.params.id).lean();

    if (!packageToDelete) {
      return res.status(404).send('Package not found');
    }

    // Fetch standalone enrollments before wiping them to clear third-party records
    const activeEnrollments = await packageEnrolmentModel.find({ packageId: req.params.id }).lean();

    // --- cancel student subs
    if (packageToDelete.type === 'subscription' && activeEnrollments.length > 0) {
      console.log(`Cancelling ${activeEnrollments.length} subscriptions for deleted package.`);
      
      await Promise.allSettled(
        activeEnrollments.map(enrollment => 
          cancelStudentSubscription(enrollment.studentId, false)
        )
      );
    }
    
    // --- Remove profile picture:
    if(packageToDelete.packageCoverPhoto?.url) {
      const { fileName } = packageToDelete.packageCoverPhoto;
      await cloudinary.uploader.destroy(fileName, (err, result) => {
        if (err) console.error('Error deleting cover picture:', err);
      });
    }

    // --- cascading delete operations
    await packageModel.findByIdAndDelete(req.params.id);
    await packageEnrolmentModel.deleteMany({ packageId: req.params.id });

    // Append history data onto deleted payload instance to preserve frontend view context tracking
    const deletedPayload = {
        ...packageToDelete,
        studentsEnrolled: activeEnrollments.map(e => ({
            studentId: e.studentId,
            startDate: e.startDate,
            endDate: e.endDate
        }))
    };

    const io = getIo();
    io.emit('packageEvent-' + deletedPayload.schoolId, {action: 'packageDeleted', data: deletedPayload});
    
    res.status(201).json(deletedPayload);
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).send('Internal Server Error');
  }
});
/**
 * Reusable utility to attach studentsEnrolled array to packages on the fly.
 * Handles both a single package object or an array of packages.
 * Expects plain JavaScript objects (lean queries or .toObject() called).
 */

async function attachPackageEnrollments(packagesOrPackage) {
    if (!packagesOrPackage) return packagesOrPackage;

    const isArray = Array.isArray(packagesOrPackage);
    // Standardize to an array and ensure plain JS objects
    let packagesList = isArray 
        ? packagesOrPackage.map(p => (typeof p.toObject === 'function' ? p.toObject() : p))
        : [typeof packagesOrPackage.toObject === 'function' ? packagesOrPackage.toObject() : packagesOrPackage];

    const packageIds = packagesList.map(p => p._id);

    // 1. Fetch all enrollments for these packages in one single trip to the DB
    const enrollments = await packageEnrolmentModel.find({ packageId: { $in: packageIds } }).lean();

    // 2. Map group entries by packageId for O(1) indexing
    const enrollmentsMap = enrollments.reduce((acc, enrollment) => {
        const pId = enrollment.packageId.toString();
        if (!acc[pId]) acc[pId] = [];
        
        acc[pId].push({
            studentId: enrollment.studentId,
            startDate: enrollment.startDate,
            endDate: enrollment.endDate
        });
        return acc;
    }, {});

    // 3. Append the array onto the packages to match the legacy frontend model
    packagesList.forEach(p => {
        p.studentsEnrolled = enrollmentsMap[p._id.toString()] || [];
    });

    return isArray ? packagesList : packagesList[0];
}


module.exports = router;
