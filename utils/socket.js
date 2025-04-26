const socketIo = require("socket.io-client")
// Create a singleton socket instance
let socket = null

// Initialize socket connection
const initSocket = (token, deviceId) => {
    if (socket) {
        socket.disconnect()
    }

    socket = socketIo(process.env.SOCKET_URL || "http://localhost:5000", {
        auth: {
            token,
            deviceId,
        },
    })

    // Set up event listeners
    socket.on("connect", () => {
        console.log("Socket connected")
    })

    socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error)
    })

    socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason)
    })

    return socket
}

// Get the socket instance
const getSocket = () => {
    if (!socket) {
        throw new Error("Socket not initialized. Call initSocket first.")
    }
    return socket
}

module.exports = {
    initSocket,
    getSocket,
}
