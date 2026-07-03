const Message = require("../models/message")
const Conversation = require("../models/conversation")
const Call = require("../models/call")
const GroupCall = require("../models/group-call")
const CallLog = require("../models/call-log")
const mongoose = require("mongoose")

/**
 * GET /api/sync?lastSyncAt=<ISO_DATE>
 *
 * Two modes:
 *
 * ① BOOTSTRAP  (no lastSyncAt supplied, or ?bootstrap=true)
 *   - ALL conversations the user participates in
 *   - Last 50 messages per conversation (most recent conversations first, up to 30 convos)
 *   - Last 100 call history entries
 *   - Last 300 call log events
 *
 * ② DELTA      (lastSyncAt supplied)
 *   - Only conversations / messages / calls / call-logs updated since that timestamp
 */
exports.syncData = async (req, res) => {
    try {
        const userId = req.userId
        const { lastSyncAt, bootstrap } = req.query

        // ── Validate delta timestamp (if provided) ──────────────────────────
        if (lastSyncAt) {
            const ts = new Date(lastSyncAt)
            if (isNaN(ts.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid lastSyncAt timestamp",
                })
            }
        }

        const isBootstrap = !lastSyncAt || bootstrap === "true"
        const userObjectId = new mongoose.Types.ObjectId(userId)

        // ═══════════════════════════════════════════════════════════════════
        // BOOTSTRAP  — full initial load, no time filter on conversations
        // ═══════════════════════════════════════════════════════════════════
        if (isBootstrap) {
            // 1. ALL conversations (sorted newest first so we pre-cache the most relevant)
            const allConversations = await Conversation.find({
                participants: userObjectId,
            })
                .sort({ updatedAt: -1 })
                .populate("participants", "_id name phoneNumber profilePicture")
                .populate({
                    path: "lastMessage",
                    select: "content contentType sender createdAt isDeleted",
                    populate: { path: "sender", select: "_id name" },
                })
                .lean()

            const conversationIds = allConversations.map((c) => c._id)

            // 2. Last 50 messages per conversation — but cap at 30 most-recent
            //    conversations to keep the payload reasonable.
            const CONV_LIMIT    = 30
            const MSG_PER_CONV  = 50
            const recentConvIds = conversationIds.slice(0, CONV_LIMIT)

            const messagesByConv = await Promise.all(
                recentConvIds.map((convId) =>
                    Message.find({
                        conversationId: convId,
                        isDeleted:   false,
                        deletedFor:  { $ne: userObjectId },
                    })
                        .sort({ createdAt: -1 })
                        .limit(MSG_PER_CONV)
                        .populate("sender", "_id name phoneNumber profilePicture")
                        .populate({
                            path: "replyTo",
                            select: "content contentType sender",
                            populate: { path: "sender", select: "_id name" },
                        })
                        .lean()
                        .then((msgs) => msgs.reverse()), // chronological order
                ),
            )
            const messages = messagesByConv.flat()

            // 3. Mark fetched messages as delivered
            const toDeliver = messages
                .filter(
                    (m) =>
                        m.sender._id.toString() !== userId &&
                        !m.deliveredTo?.some((d) => d.user.toString() === userId),
                )
                .map((m) => m._id)

            if (toDeliver.length > 0) {
                await Message.updateMany(
                    { _id: { $in: toDeliver } },
                    { $push: { deliveredTo: { user: userObjectId, deliveredAt: new Date() } } },
                )
            }

            // 4. Last 100 call history entries
            const [bootCalls, bootGroupCalls] = await Promise.all([
                Call.find({ $or: [{ caller: userObjectId }, { receiver: userObjectId }] })
                    .sort({ startTime: -1 })
                    .limit(100)
                    .populate("caller",   "_id name phoneNumber profilePicture")
                    .populate("receiver", "_id name phoneNumber profilePicture")
                    .lean(),

                GroupCall.find({ "participants.user": userObjectId })
                    .sort({ startTime: -1 })
                    .limit(100)
                    .populate("initiator",         "_id name phoneNumber profilePicture")
                    .populate("participants.user",  "_id name phoneNumber profilePicture")
                    .populate("conversationId",    "groupName isGroup")
                    .lean(),
            ])

            const callHistory = buildCallHistory(bootCalls, bootGroupCalls, userId)

            // 5. Last 300 call log events
            const callLogs = await CallLog.find({ user: userObjectId })
                .sort({ timestamp: -1 })
                .limit(300)
                .populate("user", "_id name phoneNumber profilePicture")
                .lean()

            return res.status(200).json({
                success:    true,
                serverTime: new Date().toISOString(),
                isBootstrap: true,
                data: { conversations: allConversations, messages, callHistory, callLogs },
            })
        }

        // ═══════════════════════════════════════════════════════════════════
        // DELTA  — only what changed since lastSyncAt
        // ═══════════════════════════════════════════════════════════════════
        const since = new Date(lastSyncAt)

        // 1. Conversations updated since last sync
        const conversations = await Conversation.find({
            participants: userObjectId,
            updatedAt:    { $gt: since },
        })
            .populate("participants", "_id name phoneNumber profilePicture")
            .populate({
                path: "lastMessage",
                select: "content contentType sender createdAt isDeleted",
                populate: { path: "sender", select: "_id name" },
            })
            .lean()

        // 2. All conversation IDs (for the message query scope)
        const allConvIds = await Conversation.find({ participants: userObjectId })
            .select("_id")
            .lean()
            .then((docs) => docs.map((d) => d._id))

        // 3. Messages updated since last sync
        const messages = await Message.find({
            conversationId: { $in: allConvIds },
            updatedAt:      { $gt: since },
            isDeleted:      false,
            deletedFor:     { $ne: userObjectId },
        })
            .populate("sender", "_id name phoneNumber profilePicture")
            .populate({
                path: "replyTo",
                select: "content contentType sender",
                populate: { path: "sender", select: "_id name" },
            })
            .sort({ createdAt: 1 })
            .lean()

        // 4. Mark as delivered
        const toDeliver = messages
            .filter(
                (m) =>
                    m.sender._id.toString() !== userId &&
                    !m.deliveredTo?.some((d) => d.user.toString() === userId),
            )
            .map((m) => m._id)

        if (toDeliver.length > 0) {
            await Message.updateMany(
                { _id: { $in: toDeliver } },
                { $push: { deliveredTo: { user: userObjectId, deliveredAt: new Date() } } },
            )
        }

        // 5. Calls updated since last sync
        const [deltaCalls, deltaGroupCalls] = await Promise.all([
            Call.find({
                $or: [{ caller: userObjectId }, { receiver: userObjectId }],
                updatedAt: { $gt: since },
            })
                .populate("caller",   "_id name phoneNumber profilePicture")
                .populate("receiver", "_id name phoneNumber profilePicture")
                .sort({ startTime: -1 })
                .lean(),

            GroupCall.find({
                "participants.user": userObjectId,
                updatedAt:          { $gt: since },
            })
                .populate("initiator",         "_id name phoneNumber profilePicture")
                .populate("participants.user",  "_id name phoneNumber profilePicture")
                .populate("conversationId",    "groupName isGroup")
                .sort({ startTime: -1 })
                .lean(),
        ])

        const callHistory = buildCallHistory(deltaCalls, deltaGroupCalls, userId)

        // 6. Call logs updated since last sync
        const callLogs = await CallLog.find({
            user:      userObjectId,
            updatedAt: { $gt: since },
        })
            .populate("user", "_id name phoneNumber profilePicture")
            .sort({ timestamp: -1 })
            .lean()

        return res.status(200).json({
            success:     true,
            serverTime:  new Date().toISOString(),
            isBootstrap: false,
            data: { conversations, messages, callHistory, callLogs },
        })

    } catch (error) {
        console.error("Sync error:", error)
        return res.status(500).json({
            success: false,
            message: "Server error during sync",
            error:   error.message,
        })
    }
}

// ── Helper: normalise Call + GroupCall into a unified history array ───────────
function buildCallHistory(calls, groupCalls, userId) {
    return [
        ...calls.map((call) => ({
            type:      "one-to-one",
            id:        call._id,
            startTime: call.startTime,
            endTime:   call.endTime,
            duration:  call.duration,
            status:    call.status,
            callType:  call.type,
            updatedAt: call.updatedAt,
            participants: [
                { user: call.caller,   role: call.caller._id.toString()   === userId ? "self" : "caller" },
                { user: call.receiver, role: call.receiver._id.toString() === userId ? "self" : "receiver" },
            ],
        })),
        ...groupCalls.map((gc) => ({
            type:         "group",
            id:           gc._id,
            startTime:    gc.startTime,
            endTime:      gc.endTime,
            duration:     gc.duration,
            status:       gc.status,
            callType:     gc.type,
            updatedAt:    gc.updatedAt,
            name:         gc.name,
            conversation: gc.conversationId,
            participants: gc.participants.map((p) => ({
                user:     p.user,
                role:
                    p.user._id.toString() === userId
                        ? "self"
                        : p.user._id.toString() === gc.initiator._id.toString()
                            ? "initiator"
                            : "participant",
                joinedAt: p.joinedAt,
                leftAt:   p.leftAt,
                duration: p.leftAt ? (new Date(p.leftAt) - new Date(p.joinedAt)) / 1000 : null,
            })),
        })),
    ].sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
}
