const GroupCall = require("../models/group-call")
const Conversation = require("../models/conversation")
const { getSocketInstance } = require("../utils/socket-utils") // ✅ Use the socket manager

// Create a new group call
exports.createGroupCall = async (req, res) => {
    try {
        const userId = req.userId
        const { conversationId, type, name, initialParticipants = [] } = req.body

        if (!conversationId || !type || !["audio", "video"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Conversation ID and valid call type (audio/video) are required",
            })
        }

        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId })
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        const existingActiveCall = await GroupCall.findOne({
            conversationId,
            status: { $in: ["connecting", "ringing", "active"] },
        })
        if (existingActiveCall) {
            return res.status(400).json({
                success: false,
                message: "There is already an active call in this conversation. You might want to join it.",
                call: existingActiveCall,
            })
        }

        const callParticipants = [
            {
                user: userId,
                isActive: true,
                joinedAt: new Date(),
                isMuted: false,
                isVideoOff: type === "audio",
                isSharingScreen: false,
            },
        ]

        initialParticipants.forEach((p) => {
            if (p.userId && p.userId.toString() !== userId.toString()) {
                callParticipants.push({
                    user: p.userId,
                    isActive: false,
                    targetDeviceId: p.targetDeviceId,
                    isMuted: false,
                    isVideoOff: type === "audio",
                    isSharingScreen: false,
                })
            }
        })

        const newGroupCall = new GroupCall({
            name:
                name ||
                (conversation.isGroup
                    ? conversation.groupName
                    : `Call with ${conversation.participants.find((p) => p._id.toString() !== userId.toString())?.name || "User"}`),
            initiator: userId,
            participants: callParticipants,
            conversationId,
            type,
            status: "connecting",
        })

        await newGroupCall.save()
        await newGroupCall.populate([
            { path: "initiator", select: "_id name phoneNumber profilePicture" },
            { path: "participants.user", select: "_id name phoneNumber profilePicture" },
        ])

        // ✅ GET SOCKET INSTANCE SAFELY
        try {
            const io = getSocketInstance()

            initialParticipants.forEach((p) => {
                if (p.userId && p.userId.toString() !== userId.toString()) {
                    const participantDetail = newGroupCall.participants.find(
                        (callP) => callP.user._id.toString() === p.userId.toString(),
                    )
                    io.to(p.userId.toString()).emit("incoming-group-call", {
                        call: newGroupCall,
                        targetDeviceId: p.targetDeviceId,
                    })
                }
            })
        } catch (socketError) {
            console.error("Socket not available:", socketError.message)
            // Continue without socket emission - the call is still created
        }

        res.status(201).json({ success: true, groupCall: newGroupCall })
    } catch (error) {
        console.error("Create group call error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}

// Join a group call
exports.joinGroupCall = async (req, res) => {
    try {
        const userId = req.userId
        const { groupCallId } = req.params

        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({ success: false, message: "Group call not found" })
        }

        if (!["connecting", "ringing", "active"].includes(groupCall.status)) {
            return res.status(400).json({ success: false, message: "Call cannot be joined or has ended." })
        }

        const conversation = await Conversation.findOne({ _id: groupCall.conversationId, participants: userId })
        if (!conversation) {
            return res.status(403).json({ success: false, message: "You are not allowed to join this call" })
        }

        const activeParticipantsCount = groupCall.participants.filter((p) => p.isActive).length
        if (activeParticipantsCount >= (groupCall.maxParticipants || 10)) {
            return res.status(400).json({ success: false, message: `Maximum participants reached.` })
        }

        const participantEntry = groupCall.participants.find((p) => p.user.toString() === userId)

        if (participantEntry) {
            if (!participantEntry.isActive) {
                participantEntry.isActive = true
                participantEntry.joinedAt = new Date()
                participantEntry.leftAt = null
            }
        } else {
            groupCall.participants.push({
                user: userId,
                isActive: true,
                joinedAt: new Date(),
                isMuted: false,
                isVideoOff: groupCall.type === "audio",
                isSharingScreen: false,
            })
        }

        if (
            (groupCall.status === "connecting" || groupCall.status === "ringing") &&
            groupCall.participants.filter((p) => p.isActive).length > 0
        ) {
            groupCall.status = "active"
            if (!groupCall.startTime) {
                groupCall.startTime = new Date()
            }
        }

        await groupCall.save()
        await groupCall.populate([
            { path: "initiator", select: "_id name phoneNumber profilePicture" },
            { path: "participants.user", select: "_id name phoneNumber profilePicture" },
        ])

        // ✅ GET SOCKET INSTANCE SAFELY
        try {
            const io = getSocketInstance()
            const updatedParticipantInfo = groupCall.participants.find((p) => p.user._id.toString() === userId)

            groupCall.participants.forEach((p) => {
                if (p.isActive && p.user._id.toString() !== userId) {
                    io.to(p.user._id.toString()).emit("participant-joined-group-call", {
                        callId: groupCall._id,
                        participant: updatedParticipantInfo,
                    })
                }
            })
        } catch (socketError) {
            console.error("Socket not available:", socketError.message)
        }

        res.status(200).json({ success: true, groupCall })
    } catch (error) {
        console.error("Join group call error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}

// Leave a group call
exports.leaveGroupCall = async (req, res) => {
    try {
        const userId = req.userId
        const { groupCallId } = req.params

        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({ success: false, message: "Group call not found" })
        }
        if (groupCall.status === "ended" || groupCall.status === "completed") {
            return res.status(400).json({ success: false, message: "Call has already ended." })
        }

        const participantEntry = groupCall.participants.find((p) => p.user.toString() === userId)
        if (participantEntry && participantEntry.isActive) {
            participantEntry.isActive = false
            participantEntry.leftAt = new Date()
            participantEntry.isSharingScreen = false

            const activeParticipants = groupCall.participants.filter((p) => p.isActive)
            if (activeParticipants.length === 0) {
                groupCall.status = "ended"
                groupCall.endTime = new Date()
                if (groupCall.startTime) {
                    const durationMs = new Date(groupCall.endTime) - new Date(groupCall.startTime)
                    groupCall.duration = Math.round(durationMs / 1000)
                }
                groupCall.endReason = "All participants left"
            }

            await groupCall.save()
            await groupCall.populate([
                { path: "initiator", select: "_id name phoneNumber profilePicture" },
                { path: "participants.user", select: "_id name phoneNumber profilePicture" },
            ])

            // ✅ GET SOCKET INSTANCE SAFELY
            try {
                const io = getSocketInstance()
                const leftParticipantInfo = groupCall.participants.find((p) => p.user._id.toString() === userId)

                groupCall.participants.forEach((p) => {
                    if (p.isActive) {
                        io.to(p.user._id.toString()).emit("participant-left-group-call", {
                            callId: groupCall._id,
                            participantId: userId,
                            participant: leftParticipantInfo,
                        })
                    }
                })

                if (groupCall.status === "ended") {
                    groupCall.participants.forEach((p) => {
                        io.to(p.user._id.toString()).emit("group-call-ended", {
                            callId: groupCall._id,
                            reason: groupCall.endReason,
                        })
                    })
                }
            } catch (socketError) {
                console.error("Socket not available:", socketError.message)
            }

            res.status(200).json({ success: true, message: "Successfully left the call", groupCall })
        } else {
            return res.status(400).json({ success: false, message: "You are not an active participant in this call." })
        }
    } catch (error) {
        console.error("Leave group call error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}

// End a group call (typically by initiator)
exports.endGroupCall = async (req, res) => {
    try {
        const userId = req.userId
        const { groupCallId } = req.params

        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({ success: false, message: "Group call not found" })
        }

        if (groupCall.initiator.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Only the call initiator can end the call for everyone." })
        }

        if (groupCall.status === "ended" || groupCall.status === "completed") {
            return res.status(400).json({ success: false, message: "Call has already ended." })
        }

        groupCall.status = "ended"
        groupCall.endTime = new Date()
        groupCall.endReason = "Call ended by initiator"
        if (groupCall.startTime) {
            const durationMs = new Date(groupCall.endTime) - new Date(groupCall.startTime)
            groupCall.duration = Math.round(durationMs / 1000)
        }

        groupCall.participants.forEach((p) => {
            if (p.isActive) {
                p.isActive = false
                p.leftAt = groupCall.endTime
                p.isSharingScreen = false
            }
        })

        await groupCall.save()
        await groupCall.populate([
            { path: "initiator", select: "_id name phoneNumber profilePicture" },
            { path: "participants.user", select: "_id name phoneNumber profilePicture" },
        ])

        // ✅ GET SOCKET INSTANCE SAFELY
        try {
            const io = getSocketInstance()
            groupCall.participants.forEach((p) => {
                io.to(p.user._id.toString()).emit("group-call-ended", {
                    callId: groupCall._id,
                    reason: groupCall.endReason,
                    callDetails: groupCall,
                })
            })
        } catch (socketError) {
            console.error("Socket not available:", socketError.message)
        }

        res.status(200).json({ success: true, message: "Group call ended successfully", groupCall })
    } catch (error) {
        console.error("End group call error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}

// Update group call status
exports.updateCallStatus = async (req, res) => {
    try {
        const userId = req.userId
        const { groupCallId } = req.params
        const { status, reason, targetUserId } = req.body

        const allowedStatuses = ["connecting", "ringing", "active", "missed", "rejected", "failed", "ended", "completed"]
        if (!status || !allowedStatuses.includes(status)) {
            return res
                .status(400)
                .json({ success: false, message: `Valid status is required. Allowed: ${allowedStatuses.join(", ")}` })
        }

        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall) {
            return res.status(404).json({ success: false, message: "Group call not found" })
        }

        let statusUpdated = false

        if (targetUserId) {
            const participant = groupCall.participants.find((p) => p.user.toString() === targetUserId)
            if (participant) {
                if (status === "missed" || status === "rejected") {
                    participant.isActive = false
                    participant.callStatus = status
                    participant.leftAt = new Date()
                    statusUpdated = true

                    const activeParticipants = groupCall.participants.filter((p) => p.isActive)
                    const pendingParticipants = groupCall.participants.filter(
                        (p) => !p.callStatus && !p.isActive && p.user.toString() !== groupCall.initiator.toString(),
                    )

                    if (activeParticipants.length <= 1 && pendingParticipants.length === 0 && groupCall.status !== "active") {
                        groupCall.status = "failed"
                        groupCall.endTime = new Date()
                        groupCall.endReason = "No participants joined"
                        if (groupCall.startTime) {
                            const durationMs = new Date(groupCall.endTime) - new Date(groupCall.startTime)
                            groupCall.duration = Math.round(durationMs / 1000)
                        }
                        groupCall.participants.forEach((p) => {
                            if (p.isActive) p.isActive = false
                            if (!p.leftAt) p.leftAt = new Date()
                        })
                    }
                }
            }
        } else {
            groupCall.status = status
            statusUpdated = true
            if (reason) {
                groupCall.endReason = reason
            }
            if (["ended", "completed", "failed"].includes(status)) {
                groupCall.endTime = groupCall.endTime || new Date()
                if (
                    !groupCall.startTime &&
                    status === "failed" &&
                    groupCall.participants.filter((p) => p.isActive).length <= 1
                ) {
                    // No start time, means call never really started.
                } else if (groupCall.startTime) {
                    const durationMs = new Date(groupCall.endTime) - new Date(groupCall.startTime)
                    groupCall.duration = Math.round(durationMs / 1000)
                }
                groupCall.participants.forEach((p) => {
                    if (p.isActive) {
                        p.isActive = false
                        p.leftAt = groupCall.endTime
                        p.isSharingScreen = false
                    }
                })
            } else if (status === "active" && !groupCall.startTime) {
                groupCall.startTime = new Date()
            }
        }

        if (statusUpdated) await groupCall.save()
        else return res.status(400).json({ success: false, message: "No status changes applied." })

        await groupCall.populate([
            { path: "initiator", select: "_id name phoneNumber profilePicture" },
            { path: "participants.user", select: "_id name phoneNumber profilePicture" },
        ])

        // ✅ GET SOCKET INSTANCE SAFELY
        try {
            const io = getSocketInstance()
            groupCall.participants.forEach((p) => {
                io.to(p.user._id.toString()).emit("group-call-status-updated", {
                    callId: groupCall._id,
                    status: groupCall.status,
                    participantId: targetUserId,
                    participantStatus: targetUserId ? status : undefined,
                    reason: reason,
                    callDetails: groupCall,
                })
            })
            if (["ended", "completed", "failed"].includes(groupCall.status)) {
                groupCall.participants.forEach((p) => {
                    io.to(p.user._id.toString()).emit("group-call-ended", {
                        callId: groupCall._id,
                        reason: groupCall.endReason,
                        callDetails: groupCall,
                    })
                })
            }
        } catch (socketError) {
            console.error("Socket not available:", socketError.message)
        }

        res.status(200).json({ success: true, message: `Group call status updated`, groupCall })
    } catch (error) {
        console.error("Update group call status error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}

// Toggle screen sharing for a participant
exports.toggleScreenSharing = async (req, res) => {
    try {
        const userId = req.userId
        const { groupCallId } = req.params
        const { isSharing } = req.body

        if (typeof isSharing !== "boolean") {
            return res.status(400).json({ success: false, message: "isSharing (boolean) is required in the body." })
        }

        const groupCall = await GroupCall.findById(groupCallId)
        if (!groupCall || groupCall.status !== "active") {
            return res.status(404).json({ success: false, message: "Active group call not found" })
        }

        const participantEntry = groupCall.participants.find((p) => p.user.toString() === userId && p.isActive)
        if (!participantEntry) {
            return res.status(403).json({ success: false, message: "You are not an active participant in this call." })
        }

        participantEntry.isSharingScreen = isSharing
        await groupCall.save()

        await groupCall.populate([{ path: "participants.user", select: "_id name phoneNumber profilePicture" }])

        // ✅ GET SOCKET INSTANCE SAFELY
        try {
            const io = getSocketInstance()
            const updatedParticipantInfo = groupCall.participants.find((p) => p.user._id.toString() === userId)

            groupCall.participants.forEach((p) => {
                if (p.isActive) {
                    io.to(p.user._id.toString()).emit("participant-screen-share-toggled", {
                        callId: groupCall._id,
                        participantId: userId,
                        isSharingScreen: isSharing,
                        participant: updatedParticipantInfo,
                    })
                }
            })
        } catch (socketError) {
            console.error("Socket not available:", socketError.message)
        }

        res.status(200).json({ success: true, message: `Screen sharing ${isSharing ? "started" : "stopped"}`, groupCall })
    } catch (error) {
        console.error("Toggle screen sharing error:", error)
        res.status(500).json({ success: false, message: "Server error: " + error.message })
    }
}
