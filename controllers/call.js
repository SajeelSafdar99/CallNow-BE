const Call = require("../models/call")
const User = require("../models/user")

// Initiate a call
exports.initiateCall = async (req, res) => {
    try {
        const callerId = req.userId // From auth middleware
        const { receiverId, type, callSignal } = req.body

        // Validate input
        if (!receiverId || !type || !["audio", "video"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Receiver ID and valid call type (audio/video) are required",
            })
        }

        // Check if receiver exists
        const receiver = await User.findById(receiverId)
        if (!receiver) {
            return res.status(404).json({
                success: false,
                message: "Receiver not found",
            })
        }

        // Create new call record
        const newCall = new Call({
            caller: callerId,
            receiver: receiverId,
            type,
            status: "initiated",
            callSignal,
        })

        await newCall.save()

        // Populate caller and receiver info
        await newCall.populate("caller", "_id name phoneNumber profilePicture")
        await newCall.populate("receiver", "_id name phoneNumber profilePicture")

        res.status(201).json({
            success: true,
            call: newCall,
        })
    } catch (error) {
        console.error("Initiate call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while initiating call",
        })
    }
}

// Update call status
exports.updateCallStatus = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId } = req.params
        const { status, endTime } = req.body

        // Validate input
        if (!status || !["ringing", "ongoing", "completed", "missed", "rejected", "failed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Valid call status is required",
            })
        }

        // Find the call
        const call = await Call.findById(callId)
        if (!call) {
            return res.status(404).json({
                success: false,
                message: "Call not found",
            })
        }

        // Check if user is part of the call
        if (call.caller.toString() !== userId && call.receiver.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to update this call",
            })
        }

        // Update call status
        call.status = status

        // If call is completed, update end time and calculate duration
        if (status === "completed") {
            const callEndTime = endTime ? new Date(endTime) : new Date()
            call.endTime = callEndTime

            // Calculate duration in seconds
            const startTime = new Date(call.startTime)
            const durationMs = callEndTime - startTime
            call.duration = Math.round(durationMs / 1000) // Convert to seconds
        }

        await call.save()

        // Populate caller and receiver info
        await call.populate("caller", "_id name phoneNumber profilePicture")
        await call.populate("receiver", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            call,
        })
    } catch (error) {
        console.error("Update call status error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating call status",
        })
    }
}

// Get call history
exports.getCallHistory = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { page = 1, limit = 20 } = req.query

        // Calculate skip value for pagination
        const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

        // Find all calls where user is either caller or receiver
        const calls = await Call.find({
            $or: [{ caller: userId }, { receiver: userId }],
        })
            .sort({ startTime: -1 }) // Sort by most recent first
            .skip(skip)
            .limit(Number.parseInt(limit))
            .populate("caller", "_id name phoneNumber profilePicture")
            .populate("receiver", "_id name phoneNumber profilePicture")

        // Get total count for pagination
        const totalCalls = await Call.countDocuments({
            $or: [{ caller: userId }, { receiver: userId }],
        })

        res.status(200).json({
            success: true,
            calls,
            pagination: {
                page: Number.parseInt(page),
                limit: Number.parseInt(limit),
                totalCalls,
                totalPages: Math.ceil(totalCalls / Number.parseInt(limit)),
            },
        })
    } catch (error) {
        console.error("Get call history error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching call history",
        })
    }
}

// Get call details
exports.getCallDetails = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId } = req.params

        // Find the call
        const call = await Call.findById(callId)
            .populate("caller", "_id name phoneNumber profilePicture")
            .populate("receiver", "_id name phoneNumber profilePicture")

        if (!call) {
            return res.status(404).json({
                success: false,
                message: "Call not found",
            })
        }

        // Check if user is part of the call
        if (call.caller._id.toString() !== userId && call.receiver._id.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view this call",
            })
        }

        res.status(200).json({
            success: true,
            call,
        })
    } catch (error) {
        console.error("Get call details error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching call details",
        })
    }
}

// Delete call record
exports.deleteCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId } = req.params

        // Find the call
        const call = await Call.findById(callId)
        if (!call) {
            return res.status(404).json({
                success: false,
                message: "Call not found",
            })
        }

        // Check if user is part of the call
        if (call.caller.toString() !== userId && call.receiver.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this call",
            })
        }

        await Call.findByIdAndDelete(callId)

        res.status(200).json({
            success: true,
            message: "Call record deleted successfully",
        })
    } catch (error) {
        console.error("Delete call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while deleting call record",
        })
    }
}
