// Create a module to store active users
const activeUsers = new Map() // userId -> socket.id
let ioInstance = null;

const setSocketInstance = (io) => {
    ioInstance = io;
};

const getSocketInstance = () => {
    if (!ioInstance) {
        throw new Error('Socket.IO instance not initialized');
    }
    return ioInstance;
};

// Export functions that don't depend on io
module.exports = {
    // Store active users
    activeUsers,
    getSocketInstance,
    setSocketInstance,
    // Add a user to active users
    addActiveUser: (userId, socketId) => {
        activeUsers.set(userId, socketId)
    },

    // Remove a user from active users
    removeActiveUser: (userId) => {
        activeUsers.delete(userId)
    },

    // Check if a user is active
    isUserActive: (userId) => {
        return activeUsers.has(userId)
    },

    // Get active users count
    getActiveUsersCount: () => {
        return activeUsers.size
    },
}
