/**
 * ==============================
 *  SOCKET CONNECTION (used for live data updated)
 * ==============================
*/

const socketIo = require('socket.io');
let io;
const userSocketCount = new Map(); // track connection counts in case one user is logged on with multiple devices
const offlineTimers = new Map();
const userModel = require('./models/user-models');

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
        const userId = socket.handshake.query.userId;
        if (!userId) return;

        // 1. RECONNECTION CHECK: If there was a timer to mark them offline, kill it
        if (offlineTimers.has(userId)) {
            clearTimeout(offlineTimers.get(userId));
            offlineTimers.delete(userId);
            console.log(`User ${userId} reconnected before timeout. Stayed Online.`);
        }

        // 2. Increment count
        const currentCount = userSocketCount.get(userId) || 0;
        userSocketCount.set(userId, currentCount + 1);

        // If truly first connection (not a refresh), mark online
        if (currentCount === 0) {
            updateUserStatus(userId, 'online');
        }

        socket.on('disconnect', () => {
            const remainingCount = userSocketCount.get(userId) - 1;
            
            if (remainingCount <= 0) {
                userSocketCount.delete(userId);
                
                // 3. DEBOUNCE DISCONNECT: Wait 5 seconds before marking offline
                const timer = setTimeout(() => {
                    updateUserStatus(userId, 'offline');
                    offlineTimers.delete(userId);
                }, 5000); // 5000ms = 5 seconds

                offlineTimers.set(userId, timer);
            } else {
                userSocketCount.set(userId, remainingCount);
            }
        });

        socket.on('setStatus', (newStatus) => {
            console.log(`Manual status change for ${userId}: ${newStatus}`);
            updateUserStatus(userId, newStatus);
        });
    });
};

async function updateUserStatus(userId, status) {
    try {
        // Update DB
        const user = await userModel.findByIdAndUpdate(userId, { status }, { new: true });

        // Tell all other clients the status changed
        io.emit(`statusChanged-${userId}`, { userId, status }); // this one is to update the current logged in user
        console.log(`User ${userId} is now ${status}`);
        
        if(user?.schoolId) {
            io.emit(`userEvent-${user.schoolId}`, { data: user, action: 'usersUpdated' }); // this one is to update the array of all users
        }
    } catch (err) {
        console.error('Error updating status:', err);
    }
}

// Function to return the initialized io instance
const getIo = () => {
    if (!io) {
        throw new Error('Socket.IO is not initialized!');
    }
    return io;
};

module.exports = { initSocketIo, getIo };