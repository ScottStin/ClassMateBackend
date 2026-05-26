const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function

const notificationsModel = require('../models/notification-model');

router.get('/', async function (req, res) {
  try {
    const currentUserId = req.query.currentUserId;
    const readLimit = parseInt(req.query.readLimit || 50);

    if (!currentUserId) {
      return res.status(400).send('currentUserId is required');
    }

    const baseFilter = {
      recipients: { $in: [currentUserId] }
    };

    // Get all unread notifications
    const unreadNotifications = await notificationsModel
      .find({
        ...baseFilter,
        seenBy: { $ne: currentUserId }
      })
      .sort({ createdAt: -1 });

    // Get paginated read notifications
    const readNotifications = await notificationsModel
      .find({
        ...baseFilter,
        seenBy: currentUserId
      })
      .sort({ createdAt: -1 })
      .limit(readLimit);

    const notifications = [
      ...unreadNotifications,
      ...readNotifications
    ];

    res.json({
      notifications,
      unreadCount: unreadNotifications.length,
      hasMoreRead: readNotifications.length === readLimit
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/new', async (req, res) => {
  try {
    const newNotification = await new notificationsModel(req.body);
    const createdNotification = await newNotification.save();

    res.status(201).json(createdNotification);

    // Emit event to all connected clients after npotification is created
    if(createdNotification.recipients) {
      for(const recipient of createdNotification.recipients) {
        const io = getIo(); // Safely get the initialized Socket.IO instance
        io.emit('notificationCreated-' + recipient, createdNotification);
      }
    }
  } catch (error) {
    console.error("Error creating new notification:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post('/mark-as-seen', async (req, res) => {
  try {
    const currentUserId = req.body.currentUserId;

    await notificationsModel.updateMany(
      {
        seenBy: { $ne: currentUserId }
      },
      {
        $addToSet: { seenBy: currentUserId }
      }
    );

    res.status(200).json({ message: 'Notifications marked as seen.' });
  } catch (error) {
    console.error('Error marking notifications as seen:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;