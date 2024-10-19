const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function

const notificationsModel = require('../models/notification-model');
const userModel = require('../models/user-models');

router.get('/', async function (req, res) {
    try {
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        // If currentUserId is provided, filter notifications by schoolId
        let filter = {};
        if (currentUserId) {
            filter = { recipients: { $in: [currentUserId] } };
          }

        // Find notifications based on the filter
        const notifications = await notificationsModel.find(filter);

        // Send the filtered notifications as the response
        res.json(notifications);
    } catch (error) {
        console.error("Error getting notifications:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new', async (req, res) => {
  try {
    const newNotification = await new notificationsModel(req.body);
    const createdNotification = await newNotification.save();

    res.status(201).json(createdNotification);

    // Emit event to all connected clients after npotification is created
    if(createdNotification.recipients) {
      const io = getIo(); // Safely get the initialized Socket.IO instance
      io.emit('notificationCreated-' + createdNotification.recipients[0], createdNotification);
    }
  } catch (error) {
    console.error("Error creating new notification:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/mark-as-seen', async (req, res) => {
  try {
    const currentUserId = req.body.currentUserId;
    const notifications = req.body.notifications; // Assuming notifications is an array

    for (const notification of notifications) {
      const foundNotification = await notificationsModel.findOne({ _id: notification._id });
      if (foundNotification) {

        // Add the current user's ID to the 'seenBy' array if it's not already there
        if (!foundNotification.seenBy.includes(currentUserId)) {
          foundNotification.seenBy.push(currentUserId);
          await foundNotification.save();
        }
      }
    }

    res.status(200).json({ message: "Notifications marked as seen." });
  } catch (error) {
    console.error("Error marking notifications as seen:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;