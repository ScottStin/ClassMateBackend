// /**
//  * ==============================
//  *  SOCKET CONNECTION (used for live data updated)
//  * ==============================
// */

// const socketIo = require('socket.io');
// const http = require('http');
// const server = http.createServer(app);
// const io = socketIo(server); // Used for live data updates

// // Socket connection
// io.on('connection', (socket) => {
//   console.log('A user connected');

//   socket.on('disconnect', () => {
//     console.log('User disconnected');
//   });
// });

// module.exports = {io};

const socketIo = require('socket.io');

let io; // Declare a variable for Socket.IO

// Initialize and export io with the server
const initSocketIo = (server) => {
    io = socketIo(server, {
        cors: {
            origin: "http://localhost:4200", // Your Angular app's URL
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            credentials: true // Allow credentials (e.g., cookies)
        }
    });

    io.on('connection', (socket) => {
        console.log('A user connected');

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });
};

// Function to return the initialized io instance
const getIo = () => {
    if (!io) {
        throw new Error('Socket.IO is not initialized!');
    }
    return io;
};

module.exports = { initSocketIo, getIo };