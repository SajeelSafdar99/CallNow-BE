// utils/admin-socket-functions.js
let ioInstance = null
const socketUtils = require("./socket-utils") // Your existing socket-utils

// Function to initialize this module with the Socket.IO instance
const initializeAdminSockets = (io) => {
    ioInstance = io
}

const adminSocketFunctions = {
    notifyUserSuspension: (userId, suspensionDetails) => {
        if (!ioInstance) {
            console.error("Admin sockets not initialized for notifyUserSuspension")
            return
        }
        const socketId = socketUtils.activeUsers.get(userId) // Using your activeUsers map from socket-utils
        if (socketId) {
            ioInstance.to(socketId).emit("account:suspended", suspensionDetails)
        }
    },

    notifyUserUnsuspension: (userId) => {
        if (!ioInstance) {
            console.error("Admin sockets not initialized for notifyUserUnsuspension")
            return
        }
        const socketId = socketUtils.activeUsers.get(userId)
        if (socketId) {
            ioInstance.to(socketId).emit("account:unsuspended")
        }
    },

    notifyAdmins: (event, data) => {
        if (!ioInstance) {
            console.error("Admin sockets not initialized for notifyAdmins")
            return
        }
        ioInstance.to("admins").emit(event, data) // Assuming 'admins' is a room admins join
    },

    updateAdminDashboard: (data) => {
        if (!ioInstance) {
            console.error("Admin sockets not initialized for updateAdminDashboard")
            return
        }
        ioInstance.to("admin-dashboard").emit("dashboard:update", data) // Assuming 'admin-dashboard' is a room
    },
}

module.exports = {
    initializeAdminSockets,
    adminSocketFunctions,
}
