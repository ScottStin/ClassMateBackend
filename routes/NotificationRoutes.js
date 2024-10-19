const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function

const notificationsModel = require('../models/notification-model');
const userModel = require('../models/user-models');

router.get('/', async function (req, res) {
    try {
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        // TODO - this logic is getting the user id from the email. We should replace this by using the userid instead of the email in the req.body
        const currentUser = await userModel.findOne({ _id: currentUserId });
        const currentUserEmail = currentUser.email

        // If currentUserId is provided, filter notifications by schoolId
        let filter = {};
        if (currentUserId) {
            filter = { recipients: { $in: [currentUserEmail] } };
          }

        // Find notifications based on the filter
        const notifications = await notificationsModel.find(filter);
        console.log(notifications);

        // Send the filtered notifications as the response
        res.json(notifications);
    } catch (error) {
        console.error("Error getting notifications:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
    console.log('HIT!');
  try {
    const newNotification = await new notificationsModel(req.body);
    const createdNotification = await newNotification.save();

    res.status(201).json(createdNotification);
  } catch (error) {
    console.error("Error creating new notification:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;