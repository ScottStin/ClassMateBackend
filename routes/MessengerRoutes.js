const express = require("express");
const router = express.Router();
const { getIo } = require('../socket-io'); // Import the getIo function

router.get('/', async function (req, res) {

  const demoMessages = [
    {
      _id: 'msg1',
      messageText: 'Hey team, the deadline is tomorrow!',
      senderId: 'user1',
      recipients: undefined, // Since it's a group chat, recipients are implied
      deleted: false,
      edited: false,
      attachment: undefined,
      chatGroupId: 'group1',
      createdAt: '2025-03-19T09:00:00Z',
    },
    {
      _id: 'msg2',
      messageText: 'Got it, I will finish my part today.',
      senderId: 'user2',
      recipients: undefined,
      deleted: false,
      edited: false,
      attachment: undefined,
      chatGroupId: 'group1',
      createdAt: '2025-03-19T10:15:00Z',
    },
    {
      _id: 'msg3',
      messageText: 'Wanna hang out tonight?',
      senderId: 'user1',
      recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
      deleted: false,
      edited: false,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T19:45:00Z',
    },
    {
      _id: 'msg4',
      messageText: 'Sure, where should we meet?',
      senderId: 'user4',
      recipients: [{ userId: 'user1', seenAt: undefined }], // Not yet seen by sender
      deleted: false,
      edited: false,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T20:10:00Z',
    },
    {
      _id: 'msg5',
      messageText: 'Check out this file',
      senderId: 'user3',
      recipients: undefined,
      deleted: false,
      edited: false,
      attachment: { url: 'https://example.com/file.pdf', fileName: 'file.pdf' },
      chatGroupId: 'group1',
      createdAt: '2025-03-19T11:00:00Z',
    },
    {
      _id: 'msg6',
      messageText: 'Test multi message',
      senderId: 'user3',
      recipients: [
        { userId: 'user1', seenAt: undefined },
        { userId: 'user4', seenAt: '2025-03-19T20:00:00Z' },
        { userId: 'user5', seenAt: '2025-03-19T20:00:00Z' },
        { userId: 'user6', seenAt: '2025-03-19T20:00:00Z' },
      ],
      deleted: false,
      edited: false,
      attachment: { url: 'https://example.com/file.pdf', fileName: 'file.pdf' },
      chatGroupId: undefined,
      createdAt: '2025-03-19T11:00:00Z',
    },
    {
      _id: 'msg7',
      messageText: 'Wanna hang out tonight?',
      senderId: 'user1',
      recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
      deleted: false,
      edited: true,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T19:45:00Z',
    },
    {
      _id: 'msg8',
      messageText: 'Wanna hang out tonight?',
      senderId: 'user1',
      recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
      deleted: false,
      edited: true,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T19:45:00Z',
    },
    {
      _id: 'msg9',
      messageText: 'Wanna hang out tonight?',
      senderId: 'user1',
      recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
      deleted: true,
      edited: true,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T19:45:00Z',
    },
    {
      _id: 'msg10',
      messageText: 'Wanna hang out tonight?',
      senderId: 'user1',
      recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
      deleted: true,
      edited: true,
      attachment: undefined,
      chatGroupId: undefined,
      createdAt: '2025-03-19T19:45:00Z',
    },
    {
      _id: 'msg1',
      messageText: 'Hey team, the deadline is tomorrow!',
      senderId: 'user1',
      chatGroupId: 'group1',
      createdAt: '2025-03-25T11:00:00Z',
      deleted: false,
      edited: true,
    },
    {
      _id: 'msg1',
      messageText: 'Hey team, the deadline is tomorrow!',
      senderId: 'user1',
      chatGroupId: 'group1',
      createdAt: '2025-03-19T09:00:00Z',
      deleted: false,
      edited: false,
    },
    {
      _id: 'msg2',
      messageText: 'Got it, I will finish my part today.',
      senderId: 'user2',
      chatGroupId: 'group1',
      createdAt: '2025-03-19T10:15:00Z',
      deleted: false,
      edited: false,
    },
  
    // Message from yesterday
    {
      _id: 'msg11',
      messageText: 'Reminder: Meeting notes are shared.',
      senderId: 'user3',
      chatGroupId: 'group1',
      createdAt: '2025-03-18T14:30:00Z',
      deleted: false,
      edited: false,
    },
  
    // Message from earlier this week (Monday)
    {
      _id: 'msg12',
      messageText: 'I have updated the docs!',
      senderId: 'user4',
      chatGroupId: 'group1',
      createdAt: '2025-03-17T08:45:00Z',
      deleted: false,
      edited: false,
    },
  
    // Message from last week
    {
      _id: 'msg13',
      messageText: 'Any updates on the feature release?',
      senderId: 'user5',
      chatGroupId: 'group1',
      createdAt: '2025-03-11T16:20:00Z',
      deleted: false,
      edited: false,
    },
  
    // Message from last month
    {
      _id: 'msg14',
      messageText: 'Check out the monthly report.',
      senderId: 'user6',
      chatGroupId: 'group1',
      createdAt: '2025-02-10T12:10:00Z',
      deleted: false,
      edited: false,
    },
  
    // Message from last year
    {
      _id: 'msg15',
      messageText: 'Happy New Year, everyone!',
      senderId: 'user7',
      chatGroupId: 'group1',
      createdAt: '2024-12-31T23:59:00Z',
      deleted: false,
      edited: false,
    },
  ];

  const demoChatGroups = [
    {
      _id: 'group1',
      groupName: 'Project Alpha',
      members: [
        { userId: 'user1', seenAt: '2025-03-20T10:00:00Z' },
        { userId: 'user2', seenAt: '2025-03-19T12:00:00Z' },
        { userId: 'user3', seenAt: '2025-03-18T15:30:00Z' },
      ],
    },
    {
      _id: 'group2',
      groupName: 'Friends Chat',
      members: [
        { userId: 'user1', seenAt: '2025-03-20T09:30:00Z' },
        { userId: 'user4', seenAt: '2025-03-19T11:00:00Z' },
      ],
    },
  ];
  
    try {
      console.log("TEST MESSENGER 1")
        // Extract the currentUserId from the query parameters
        const currentUserId = req.query.currentUserId;

        const test = demoMessages.filter(
            (message) =>
              message.senderId === currentUserId ||
              message.recipients
                ?.map((recipients) => recipients.userId)
                .includes(currentUserId) ||
              (message.chatGroupId !== undefined &&
                demoChatGroups.filter(
                  (group) =>
                    group._id === message.chatGroupId &&
                    group.members.map((member) => member.userId).includes(currentUserId)
                ))
          );
        res.json(test);
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
        { userId: 'user1', seenAt: '2025-03-20T10:00:00Z' },
        { userId: 'user2', seenAt: '2025-03-19T12:00:00Z' },
        { userId: 'user3', seenAt: '2025-03-18T15:30:00Z' },
      ],
    },
    {
      _id: 'group2',
      groupName: 'Friends Chat',
      members: [
        { userId: 'user1', seenAt: '2025-03-20T09:30:00Z' },
        { userId: 'user4', seenAt: '2025-03-19T11:00:00Z' },
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

module.exports = router;

// export const demoChatGroups = [
//   {
//     _id: 'group1',
//     groupName: 'Project Alpha',
//     members: [
//       { userId: 'user1', seenAt: '2025-03-20T10:00:00Z' },
//       { userId: 'user2', seenAt: '2025-03-19T12:00:00Z' },
//       { userId: 'user3', seenAt: '2025-03-18T15:30:00Z' },
//     ],
//   },
//   {
//     _id: 'group2',
//     groupName: 'Friends Chat',
//     members: [
//       { userId: 'user1', seenAt: '2025-03-20T09:30:00Z' },
//       { userId: 'user4', seenAt: '2025-03-19T11:00:00Z' },
//     ],
//   },
// ];

// export const demoMessages = [
//   {
//     _id: 'msg1',
//     messageText: 'Hey team, the deadline is tomorrow!',
//     senderId: 'user1',
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
//     senderId: 'user2',
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
//     senderId: 'user1',
//     recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
//     deleted: false,
//     edited: false,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T19:45:00Z',
//   },
//   {
//     _id: 'msg4',
//     messageText: 'Sure, where should we meet?',
//     senderId: 'user4',
//     recipients: [{ userId: 'user1', seenAt: undefined }], // Not yet seen by sender
//     deleted: false,
//     edited: false,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T20:10:00Z',
//   },
//   {
//     _id: 'msg5',
//     messageText: 'Check out this file',
//     senderId: 'user3',
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
//     senderId: 'user3',
//     recipients: [
//       { userId: 'user1', seenAt: undefined },
//       { userId: 'user4', seenAt: '2025-03-19T20:00:00Z' },
//       { userId: 'user5', seenAt: '2025-03-19T20:00:00Z' },
//       { userId: 'user6', seenAt: '2025-03-19T20:00:00Z' },
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
//     senderId: 'user1',
//     recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
//     deleted: false,
//     edited: true,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T19:45:00Z',
//   },
//   {
//     _id: 'msg8',
//     messageText: 'Wanna hang out tonight?',
//     senderId: 'user1',
//     recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
//     deleted: false,
//     edited: true,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T19:45:00Z',
//   },
//   {
//     _id: 'msg9',
//     messageText: 'Wanna hang out tonight?',
//     senderId: 'user1',
//     recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
//     deleted: true,
//     edited: true,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T19:45:00Z',
//   },
//   {
//     _id: 'msg10',
//     messageText: 'Wanna hang out tonight?',
//     senderId: 'user1',
//     recipients: [{ userId: 'user4', seenAt: '2025-03-19T20:00:00Z' }], // Direct message
//     deleted: true,
//     edited: true,
//     attachment: undefined,
//     chatGroupId: undefined,
//     createdAt: '2025-03-19T19:45:00Z',
//   },
//   {
//     _id: 'msg1',
//     messageText: 'Hey team, the deadline is tomorrow!',
//     senderId: 'user1',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-25T11:00:00Z',
//     deleted: false,
//     edited: true,
//   },
//   {
//     _id: 'msg1',
//     messageText: 'Hey team, the deadline is tomorrow!',
//     senderId: 'user1',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-19T09:00:00Z',
//     deleted: false,
//     edited: false,
//   },
//   {
//     _id: 'msg2',
//     messageText: 'Got it, I will finish my part today.',
//     senderId: 'user2',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-19T10:15:00Z',
//     deleted: false,
//     edited: false,
//   },

//   // Message from yesterday
//   {
//     _id: 'msg11',
//     messageText: 'Reminder: Meeting notes are shared.',
//     senderId: 'user3',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-18T14:30:00Z',
//     deleted: false,
//     edited: false,
//   },

//   // Message from earlier this week (Monday)
//   {
//     _id: 'msg12',
//     messageText: 'I have updated the docs!',
//     senderId: 'user4',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-17T08:45:00Z',
//     deleted: false,
//     edited: false,
//   },

//   // Message from last week
//   {
//     _id: 'msg13',
//     messageText: 'Any updates on the feature release?',
//     senderId: 'user5',
//     chatGroupId: 'group1',
//     createdAt: '2025-03-11T16:20:00Z',
//     deleted: false,
//     edited: false,
//   },

//   // Message from last month
//   {
//     _id: 'msg14',
//     messageText: 'Check out the monthly report.',
//     senderId: 'user6',
//     chatGroupId: 'group1',
//     createdAt: '2025-02-10T12:10:00Z',
//     deleted: false,
//     edited: false,
//   },

//   // Message from last year
//   {
//     _id: 'msg15',
//     messageText: 'Happy New Year, everyone!',
//     senderId: 'user7',
//     chatGroupId: 'group1',
//     createdAt: '2024-12-31T23:59:00Z',
//     deleted: false,
//     edited: false,
//   },
// ];
