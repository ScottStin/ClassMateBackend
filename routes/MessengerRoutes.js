const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function
const messageModel = require('../models/messenger-model');



  // const demoMessages = [
  //   {
  //     _id: 'msg1',
  //     messageText: 'Hey team, the deadline is tomorrow!',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: undefined, // Since it's a group chat, recipients are implied
  //     deleted: false,
  //     edited: false,
  //     attachment: undefined,
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-19T09:00:00Z',
  //   },
  //   {
  //     _id: 'msg2',
  //     messageText: 'Got it, I will finish my part today.',
  //     senderId: '67e51e7a31c4f5a6cca28572',
  //     recipients: undefined,
  //     deleted: false,
  //     edited: false,
  //     attachment: undefined,
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-19T10:15:00Z',
  //   },
  //   {
  //     _id: 'msg3',
  //     messageText: 'Wanna hang out tonight?',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: [{ userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
  //     deleted: false,
  //     edited: false,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T19:45:00Z',
  //   },
  //   {
  //     _id: 'msg4',
  //     messageText: 'Sure, where should we meet?',
  //     senderId: '67e917d713fc7fa0ca996c18',
  //     recipients: [{ userId: '67e5223431c4f5a6cca2880f', seenAt: undefined }], // Not yet seen by sender
  //     deleted: false,
  //     edited: false,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T20:10:00Z',
  //   },
  //   {
  //     _id: 'msg5',
  //     messageText: 'Check out this file',
  //     senderId: '67e51ee031c4f5a6cca2857e',
  //     recipients: undefined,
  //     deleted: false,
  //     edited: false,
  //     attachment: { url: 'https://example.com/file.pdf', fileName: 'file.pdf' },
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-19T11:00:00Z',
  //   },
  //   {
  //     _id: 'msg6',
  //     messageText: 'Test multi message',
  //     senderId: '67e51ee031c4f5a6cca2857e',
  //     recipients: [
  //       { userId: '67e5223431c4f5a6cca2880f', seenAt: undefined },
  //       { userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' },
  //       { userId: '67ed89ebdd2a9034679c6c1f', seenAt: '2025-03-19T20:00:00Z' },
  //       { userId: '67ed8b15dd2a9034679c6c33', seenAt: '2025-03-19T20:00:00Z' },
  //     ],
  //     deleted: false,
  //     edited: false,
  //     attachment: { url: 'https://example.com/file.pdf', fileName: 'file.pdf' },
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T11:00:00Z',
  //   },
  //   {
  //     _id: 'msg7',
  //     messageText: 'Wanna hang out tonight?',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: [{ userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
  //     deleted: false,
  //     edited: true,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T19:45:00Z',
  //   },
  //   {
  //     _id: 'msg8',
  //     messageText: 'Wanna hang out tonight?',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: [{ userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
  //     deleted: false,
  //     edited: true,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T19:45:00Z',
  //   },
  //   {
  //     _id: 'msg9',
  //     messageText: 'Wanna hang out tonight?',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: [{ userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
  //     deleted: true,
  //     edited: true,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T19:45:00Z',
  //   },
  //   {
  //     _id: 'msg10',
  //     messageText: 'Wanna hang out tonight?',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     recipients: [{ userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
  //     deleted: true,
  //     edited: true,
  //     attachment: undefined,
  //     chatGroupId: undefined,
  //     createdAt: '2025-03-19T19:45:00Z',
  //   },
  //   {
  //     _id: 'msg1',
  //     messageText: 'Hey team, the deadline is tomorrow!',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-25T11:00:00Z',
  //     deleted: false,
  //     edited: true,
  //   },
  //   {
  //     _id: 'msg1',
  //     messageText: 'Hey team, the deadline is tomorrow!',
  //     senderId: '67e5223431c4f5a6cca2880f',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-19T09:00:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  //   {
  //     _id: 'msg2',
  //     messageText: 'Got it, I will finish my part today.',
  //     senderId: '67e51e7a31c4f5a6cca28572',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-19T10:15:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  
  //   // Message from yesterday
  //   {
  //     _id: 'msg11',
  //     messageText: 'Reminder: Meeting notes are shared.',
  //     senderId: '67e51ee031c4f5a6cca2857e',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-18T14:30:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  
  //   // Message from earlier this week (Monday)
  //   {
  //     _id: 'msg12',
  //     messageText: 'I have updated the docs!',
  //     senderId: '67e917d713fc7fa0ca996c18',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-17T08:45:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  
  //   // Message from last week
  //   {
  //     _id: 'msg13',
  //     messageText: 'Any updates on the feature release?',
  //     senderId: '67ed89ebdd2a9034679c6c1f',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-03-11T16:20:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  
  //   // Message from last month
  //   {
  //     _id: 'msg14',
  //     messageText: 'Check out the monthly report.',
  //     senderId: '67ed8b15dd2a9034679c6c33',
  //     chatGroupId: 'group1',
  //     createdAt: '2025-02-10T12:10:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  
  //   // Message from last year
  //   {
  //     _id: 'msg15',
  //     messageText: 'Happy New Year, everyone!',
  //     senderId: '67e9a4399a57f5e4aa18ece8',
  //     chatGroupId: 'group1',
  //     createdAt: '2024-12-31T23:59:00Z',
  //     deleted: false,
  //     edited: false,
  //   },
  // ];

  // const demoChatGroups = [
  //   {
  //     _id: 'group1',
  //     groupName: 'Project Alpha',
  //     members: [
  //       { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T10:00:00Z' },
  //       { userId: '67e51e7a31c4f5a6cca28572', seenAt: '2025-03-19T12:00:00Z' },
  //       { userId: '67e51ee031c4f5a6cca2857e', seenAt: '2025-03-18T15:30:00Z' },
  //     ],
  //   },
  //   {
  //     _id: 'group2',
  //     groupName: 'Friends Chat',
  //     members: [
  //       { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T09:30:00Z' },
  //       { userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T11:00:00Z' },
  //     ],
  //   },
  // ];

  router.get('/', async function (req, res) {
    try {
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        if (!currentUserId) {
          return res.status(400).json({ error: 'Missing currentUserId' });
        }

        // Find the messages for the given user Id
        const messages = await messageModel.find({
          $or: [
            { senderId: currentUserId },
            { 'recipients.userId': currentUserId }
          ]
        });
    
        // const test = demoMessages.filter(
        //     (message) =>
        //       message.senderId === currentUserId ||
        //       message.recipients
        //         ?.map((recipients) => recipients.userId)
        //         .includes(currentUserId) ||
        //       (message.chatGroupId !== undefined &&
        //         demoChatGroups.filter(
        //           (group) =>
        //             group._id === message.chatGroupId &&
        //             group.members.map((member) => member.userId).includes(currentUserId)
        //         ))
        //   );
        res.json(messages);
    } catch (error) {
        console.error("Error getting messages:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/groups', async function (req, res) {
  const demoChatGroups = [
    {
      _id: 'group1',
      groupName: 'Project Alpha',
      members: [
        { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T10:00:00Z' },
        { userId: '67e51e7a31c4f5a6cca28572', seenAt: '2025-03-19T12:00:00Z' },
        { userId: '67e51ee031c4f5a6cca2857e', seenAt: '2025-03-18T15:30:00Z' },
      ],
    },
    {
      _id: 'group2',
      groupName: 'Friends Chat',
      members: [
        { userId: '67e5223431c4f5a6cca2880f', seenAt: '2025-03-20T09:30:00Z' },
        { userId: '67e917d713fc7fa0ca996c18', seenAt: '2025-03-19T11:00:00Z' },
      ],
    },
  ];

    try {
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        const test = demoChatGroups.filter((group) =>
            group.members.map((member) => member.userId).includes(currentUserId)
          );
        res.json(test);
    } catch (error) {
        console.error("Error getting message groups:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/new-message', async (req, res) => {
  try {
    console.log('req.body:');
    console.log(req.body);

    const newMessage = await messageModel.create({...req.body, createdAt: new Date()});
    
    console.log('newMessage:');
    console.log(newMessage);

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error creating new message:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;

