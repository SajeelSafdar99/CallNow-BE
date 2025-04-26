const CallLog = require("../models/call-log")
const Call = require("../models/call")
const GroupCall = require("../models/group-call")

// Log call event
exports.logCallEvent = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId, callType, eventType, metadata = {} } = req.body

        // Validate input
        if (!callId || !callType || !eventType) {
            return res.status(400).json({
                success: false,
                message: "Call ID, call type, and event type are required",
            })
        }

        // Verify the call exists and user is a participant
        let callExists = false
        if (callType === "one-to-one") {
            const call = await Call.findOne({
                _id: callId,
                $or: [{ caller: userId }, { receiver: userId }],
            })
            callExists = !!call
        } else if (callType === "group") {
            const groupCall = await GroupCall.findOne({
                _id: callId,
                "participants.user": userId,
            })
            callExists = !!groupCall
        }

        if (!callExists) {
            return res.status(404).json({
                success: false,
                message: "Call not found or you are not a participant",
            })
        }

        // Create new log entry
        const newLog = new CallLog({
            callId,
            callType,
            eventType,
            user: userId,
            metadata,
        })

        await newLog.save()

        res.status(201).json({
            success: true,
            log: newLog,
        })
    } catch (error) {
        console.error("Log call event error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while logging call event",
        })
    }
}

// Get call logs for a specific call
exports.getCallLogs = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId, callType } = req.params

        // Verify the call exists and user is a participant
        let callExists = false
        if (callType === "one-to-one") {
            const call = await Call.findOne({
                _id: callId,
                $or: [{ caller: userId }, { receiver: userId }],
            })
            callExists = !!call
        } else if (callType === "group") {
            const groupCall = await GroupCall.findOne({
                _id: callId,
                "participants.user": userId,
            })
            callExists = !!groupCall
        }

        if (!callExists) {
            return res.status(404).json({
                success: false,
                message: "Call not found or you are not a participant",
            })
        }

        // Get logs for this call
        const logs = await CallLog.find({ callId, callType })
            .sort({ timestamp: 1 })
            .populate("user", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            logs,
        })
    } catch (error) {
        console.error("Get call logs error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching call logs",
        })
    }
}

// Get unified call history for a user
exports.getCallHistory = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { page = 1, limit = 20 } = req.query

        // Calculate skip value for pagination
        const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

        // Get one-to-one calls
        const calls = await Call.find({
            $or: [{ caller: userId }, { receiver: userId }],
        })
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(Number.parseInt(limit))
            .populate("caller", "_id name phoneNumber profilePicture")
            .populate("receiver", "_id name phoneNumber profilePicture")

        // Get group calls
        const groupCalls = await GroupCall.find({
            "participants.user": userId,
        })
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(Number.parseInt(limit))
            .populate("initiator", "_id name phoneNumber profilePicture")
            .populate("participants.user", "_id name phoneNumber profilePicture")
            .populate("conversationId", "groupName isGroup")

        // Combine and sort by start time
        const allCalls = [
            ...calls.map((call) => ({
                type: "one-to-one",
                id: call._id,
                startTime: call.startTime,
                endTime: call.endTime,
                duration: call.duration,
                status: call.status,
                callType: call.type,
                participants: [
                    {
                        user: call.caller,
                        role: call.caller._id.toString() === userId ? "self" : "caller",
                    },
                    {
                        user: call.receiver,
                        role: call.receiver._id.toString() === userId ? "self" : "receiver",
                    },
                ],
            })),
            ...groupCalls.map((groupCall) => ({
                type: "group",
                id: groupCall._id,
                startTime: groupCall.startTime,
                endTime: groupCall.endTime,
                duration: groupCall.duration,
                status: groupCall.status,
                callType: groupCall.type,
                name: groupCall.name,
                conversation: groupCall.conversationId,
                participants: groupCall.participants.map((p) => ({
                    user: p.user,
                    role:
                        p.user._id.toString() === userId
                            ? "self"
                            : p.user._id.toString() === groupCall.initiator._id.toString()
                                ? "initiator"
                                : "participant",
                    joinedAt: p.joinedAt,
                    leftAt: p.leftAt,
                    duration: p.leftAt ? (new Date(p.leftAt) - new Date(p.joinedAt)) / 1000 : null,
                })),
            })),
        ].sort((a, b) => new Date(b.startTime) - new Date(a.startTime))

        // Get total count for pagination
        const totalOneToCalls = await Call.countDocuments({
            $or: [{ caller: userId }, { receiver: userId }],
        })
        const totalGroupCalls = await GroupCall.countDocuments({
            "participants.user": userId,
        })

        res.status(200).json({
            success: true,
            calls: allCalls.slice(0, Number.parseInt(limit)),
            pagination: {
                page: Number.parseInt(page),
                limit: Number.parseInt(limit),
                totalCalls: totalOneToCalls + totalGroupCalls,
                totalPages: Math.ceil((totalOneToCalls + totalGroupCalls) / Number.parseInt(limit)),
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
