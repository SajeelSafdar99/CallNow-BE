const GroupCall = require("../models/group-call")
const User = require("../models/user")
const Conversation = require("../models/conversation")
const mongoose = require("mongoose")

// Create a new group call
exports.createGroupCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId, type, name } = req.body

        // Validate input
        if (!conversationId || !type || !["audio", "video"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Conversation ID and valid call type (audio/video) are required",
            })
        }

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        // Check if there's already an active group call in this conversation
        const existingActiveCall = await GroupCall.findOne({
            conversationId,
            status: "active",
        })

        if (existingActiveCall) {
            return res.status(400).json({
                success: false,
                message: "There is already an active call in this conversation",
                callId: existingActiveCall._id,
            })
        }

        // Create new group call
        const newGroupCall = new GroupCall({
            name: name || `${conversation.isGroup ? conversation.groupName : "Call"}`,
            initiator: userId,
            participants: [{ user: userId }], // Add initiator as first participant
            conversationId,
            type,
        })

        await newGroupCall.save()

        // Populate initiator info
        await newGroupCall.populate("initiator", "_id name phoneNumber profilePicture")
        await newGroupCall.populate("participants.user", "_id name phoneNumber profilePicture")

        res.status(201).json({
            success: true,
            groupCall: newGroupCall,
        })
    } catch (error) {
        console.error("Create group call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while creating group call",
        })
    }
}

// Join a group call
exports.joinGroupCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params
        const { connectionIds = [] } = req.body

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Check if call is active
        if (groupCall.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "This call has ended",
            })
        }

        // Check if user is allowed to join (part of the conversation)
        const conversation = await Conversation.findOne({
            _id: groupCall.conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to join this call",
            })
        }

        // Check if maximum participants limit is reached
        const activeParticipants = groupCall.participants.filter((p) => p.isActive)
        if (activeParticipants.length >= groupCall.maxParticipants) {
            return res.status(400).json({
                success: false,
                message: `Maximum number of participants (${groupCall.maxParticipants}) reached`,
            })
        }

        // Check if user is already in the call
        const participantIndex = groupCall.participants.findIndex((p) => p.user.toString() === userId)

        if (participantIndex !== -1) {
            // User is rejoining
            groupCall.participants[participantIndex].isActive = true
            groupCall.participants[participantIndex].joinedAt = new Date()
            groupCall.participants[participantIndex].leftAt = null
            groupCall.participants[participantIndex].connectionIds = connectionIds
        } else {
            // New participant
            groupCall.participants.push({
                user: userId,
                connectionIds,
            })
        }

        await groupCall.save()

        // Populate participant info
        await groupCall.populate("participants.user", "_id name phoneNumber profilePicture")
        await groupCall.populate("initiator", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            groupCall,
        })
    } catch (error) {
        console.error("Join group call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while joining group call",
        })
    }
}

// Leave a group call
exports.leaveGroupCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Find participant
        const participantIndex = groupCall.participants.findIndex((p) => p.user.toString() === userId)
        if (participantIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "You are not a participant in this call",
            })
        }

        // Mark participant as inactive
        groupCall.participants[participantIndex].isActive = false
        groupCall.participants[participantIndex].leftAt = new Date()
        groupCall.participants[participantIndex].sharingScreen = false

        // Check if all participants have left
        const anyActiveParticipant = groupCall.participants.some((p) => p.isActive)
        if (!anyActiveParticipant) {
            // End the call if no active participants
            groupCall.status = "ended"
            groupCall.endTime = new Date()

            // Calculate duration in seconds
            const startTime = new Date(groupCall.startTime)
            const endTime = new Date(groupCall.endTime)
            const durationMs = endTime - startTime
            groupCall.duration = Math.round(durationMs / 1000) // Convert to seconds
        }

        await groupCall.save()

        res.status(200).json({
            success: true,
            message: "Left group call successfully",
            callEnded: !anyActiveParticipant,
        })
    } catch (error) {
        console.error("Leave group call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while leaving group call",
        })
    }
}

// End a group call (only initiator can end for everyone)
exports.endGroupCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Check if user is the initiator
        if (groupCall.initiator.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the call initiator can end the call for everyone",
            })
        }

        // End the call
        groupCall.status = "ended"
        groupCall.endTime = new Date()

        // Mark all participants as inactive
        groupCall.participants.forEach((participant) => {
            if (participant.isActive) {
                participant.isActive = false
                participant.leftAt = new Date()
                participant.sharingScreen = false
            }
        })

        // Calculate duration in seconds
        const startTime = new Date(groupCall.startTime)
        const endTime = new Date(groupCall.endTime)
        const durationMs = endTime - startTime
        groupCall.duration = Math.round(durationMs / 1000) // Convert to seconds

        await groupCall.save()

        res.status(200).json({
            success: true,
            message: "Group call ended successfully",
        })
    } catch (error) {
        console.error("End group call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while ending group call",
        })
    }
}

// Get active group call in a conversation
exports.getActiveGroupCall = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        // Find active group call in this conversation
        const activeGroupCall = await GroupCall.findOne({
            conversationId,
            status: "active",
        })
            .populate("initiator", "_id name phoneNumber profilePicture")
            .populate("participants.user", "_id name phoneNumber profilePicture")

        if (!activeGroupCall) {
            return res.status(404).json({
                success: false,
                message: "No active call in this conversation",
            })
        }

        res.status(200).json({
            success: true,
            groupCall: activeGroupCall,
        })
    } catch (error) {
        console.error("Get active group call error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching active group call",
        })
    }
}

// Get group call details
exports.getGroupCallDetails = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
            .populate("initiator", "_id name phoneNumber profilePicture")
            .populate("participants.user", "_id name phoneNumber profilePicture")

        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Check if user is a participant or was in the call
        const isParticipant = groupCall.participants.some((p) => p.user._id.toString() === userId)
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to view this call",
            })
        }

        res.status(200).json({
            success: true,
            groupCall,
        })
    } catch (error) {
        console.error("Get group call details error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching group call details",
        })
    }
}

// Get group call history
exports.getGroupCallHistory = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.query
        const { page = 1, limit = 20 } = req.query

        // Calculate skip value for pagination
        const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

        // Build query
        const query = {
            "participants.user": userId,
        }

        // Add conversation filter if provided
        if (conversationId) {
            query.conversationId = conversationId
        }

        // Find all group calls where user was a participant
        const groupCalls = await GroupCall.find(query)
            .sort({ startTime: -1 }) // Sort by most recent first
            .skip(skip)
            .limit(Number.parseInt(limit))
            .populate("initiator", "_id name phoneNumber profilePicture")
            .populate("participants.user", "_id name phoneNumber profilePicture")
            .populate("conversationId", "groupName isGroup")

        // Get total count for pagination
        const totalCalls = await GroupCall.countDocuments(query)

        res.status(200).json({
            success: true,
            groupCalls,
            pagination: {
                page: Number.parseInt(page),
                limit: Number.parseInt(limit),
                totalCalls,
                totalPages: Math.ceil(totalCalls / Number.parseInt(limit)),
            },
        })
    } catch (error) {
        console.error("Get group call history error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching group call history",
        })
    }
}

// Toggle screen sharing
exports.toggleScreenSharing = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params
        const { isSharing } = req.body

        // Validate input
        if (isSharing === undefined) {
            return res.status(400).json({
                success: false,
                message: "isSharing parameter is required",
            })
        }

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Check if call is active
        if (groupCall.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "This call has ended",
            })
        }

        // Find participant
        const participantIndex = groupCall.participants.findIndex((p) => p.user.toString() === userId && p.isActive)
        if (participantIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "You are not an active participant in this call",
            })
        }

        // If turning on screen sharing, check if anyone else is already sharing
        if (isSharing) {
            const someoneElseSharing = groupCall.participants.some(
                (p) => p.sharingScreen && p.user.toString() !== userId && p.isActive,
            )
            if (someoneElseSharing) {
                return res.status(400).json({
                    success: false,
                    message: "Another participant is already sharing their screen",
                })
            }
        }

        // Update screen sharing status
        groupCall.participants[participantIndex].sharingScreen = isSharing
        await groupCall.save()

        // Populate participant info
        await groupCall.populate("participants.user", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            message: isSharing ? "Screen sharing started" : "Screen sharing stopped",
            groupCall,
        })
    } catch (error) {
        console.error("Toggle screen sharing error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while toggling screen sharing",
        })
    }
}

// Update connection IDs for a participant
exports.updateConnectionIds = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { groupCallId } = req.params
        const { connectionIds } = req.body

        // Validate input
        if (!connectionIds || !Array.isArray(connectionIds)) {
            return res.status(400).json({
                success: false,
                message: "connectionIds array is required",
            })
        }

        // Find the group call
        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({
                success: false,
                message: "Group call not found",
            })
        }

        // Check if call is active
        if (groupCall.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "This call has ended",
            })
        }

        // Find participant
        const participantIndex = groupCall.participants.findIndex((p) => p.user.toString() === userId && p.isActive)
        if (participantIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "You are not an active participant in this call",
            })
        }

        // Update connection IDs
        groupCall.participants[participantIndex].connectionIds = connectionIds
        await groupCall.save()

        res.status(200).json({
            success: true,
            message: "Connection IDs updated successfully",
        })
    } catch (error) {
        console.error("Update connection IDs error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating connection IDs",
        })
    }
}
