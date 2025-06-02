const CallQualityMetrics = require("../models/call-quality-metrics")
const Call = require("../models/call") // Assuming you have this model
const GroupCall = require("../models/group-call") // Assuming you have this model
const User = require("../models/user") // Assuming you have a User model for admin checks
const mongoose = require("mongoose");

// Record call quality metrics (existing function - seems fine)
exports.recordMetrics = async (req, res) => {
    try {
        const userId = req.userId
        const { callId, callType, metrics } = req.body

        if (!callId || !callType || !metrics) {
            return res.status(400).json({
                success: false,
                message: "Call ID, call type, and metrics are required",
            })
        }

        let callExists = false
        if (callType === "one-to-one") {
            const call = await Call.findOne({ _id: callId, $or: [{ caller: userId }, { receiver: userId }] })
            callExists = !!call
        } else if (callType === "group") {
            const groupCall = await GroupCall.findOne({ _id: callId, "participants.user": userId })
            callExists = !!groupCall
        }

        if (!callExists) {
            return res.status(404).json({ success: false, message: "Call not found or you are not a participant" })
        }

        const newMetrics = new CallQualityMetrics({
            callId,
            callType,
            user: userId,
            timestamp: metrics.timestamp || new Date(), // Allow client to send timestamp, or default
            ...metrics, // Spread all other metric fields
        })

        await newMetrics.save()
        res.status(201).json({ success: true, message: "Call quality metrics recorded successfully" })
    } catch (error) {
        console.error("Record call quality metrics error:", error)
        res.status(500).json({ success: false, message: "Server error while recording metrics" })
    }
}

// Get call quality metrics for a specific call (existing function - seems fine for its purpose)
exports.getCallMetrics = async (req, res) => {
    try {
        const userId = req.userId
        const { callId, callType } = req.params

        let callExists = false
        if (callType === "one-to-one") {
            const call = await Call.findOne({ _id: callId, $or: [{ caller: userId }, { receiver: userId }] })
            callExists = !!call
        } else if (callType === "group") {
            const groupCall = await GroupCall.findOne({ _id: callId, "participants.user": userId })
            callExists = !!groupCall
        }

        if (!callExists) {
            return res.status(404).json({ success: false, message: "Call not found or you are not a participant" })
        }

        const metrics = await CallQualityMetrics.find({ callId, callType }).sort({ timestamp: 1 }).lean()

        const summary = {
            totalSamples: metrics.length,
            averages: {
                rtt: calculateAverage(metrics, "rtt"),
                jitter: calculateAverage(metrics, "jitter"),
                packetLoss: calculateAverage(metrics, "packetLoss"),
                frameRate: calculateAverage(metrics, "frameRate"),
                audioBitrate: calculateAverage(metrics, "bitrate.audio"),
                videoBitrate: calculateAverage(metrics, "bitrate.video"),
                audioQuality: calculateAverage(metrics, "qualityScore.audio"),
                videoQuality: calculateAverage(metrics, "qualityScore.video"),
            },
            connectionTypes: countOccurrences(metrics, "connectionType"),
            networkTypes: countOccurrences(metrics, "networkType"),
            iceStates: countOccurrences(metrics, "iceConnectionState"),
            timeline: metrics.map((m) => ({
                timestamp: m.timestamp,
                user: m.user, // Consider populating user details if needed
                rtt: m.rtt,
                jitter: m.jitter,
                packetLoss: m.packetLoss,
                iceConnectionState: m.iceConnectionState,
                qualityScore: m.qualityScore,
                connectionType: m.connectionType,
                networkType: m.networkType,
                // Add other relevant fields from the model to the timeline if needed
            })),
        }
        res.status(200).json({ success: true, summary })
    } catch (error) {
        console.error("Get call metrics error:", error)
        res.status(500).json({ success: false, message: "Server error while fetching call metrics" })
    }
}

// Get user's call quality statistics (existing function - seems fine for its purpose)
exports.getUserCallStats = async (req, res) => {
    try {
        const userId = req.userId
        const { timeframe = "week" } = req.query
        const now = new Date()
        const startDate = new Date()

        switch (timeframe) {
            case "day": startDate.setDate(now.getDate() - 1); break
            case "week": startDate.setDate(now.getDate() - 7); break
            case "month": startDate.setMonth(now.getMonth() - 1); break
            case "year": startDate.setFullYear(now.getFullYear() - 1); break
            default: startDate.setDate(now.getDate() - 7)
        }

        const metrics = await CallQualityMetrics.find({ user: userId, timestamp: { $gte: startDate } }).sort({ timestamp: 1 }).lean()
        const stats = {
            totalCalls: new Set(metrics.map((m) => m.callId.toString())).size,
            totalSamples: metrics.length,
            averages: {
                rtt: calculateAverage(metrics, "rtt"),
                jitter: calculateAverage(metrics, "jitter"),
                packetLoss: calculateAverage(metrics, "packetLoss"),
                audioQuality: calculateAverage(metrics, "qualityScore.audio"),
                videoQuality: calculateAverage(metrics, "qualityScore.video"),
                // Add more averages if needed
            },
            connectionTypes: countOccurrences(metrics, "connectionType"),
            networkTypes: countOccurrences(metrics, "networkType"),
            networkIssues: countNetworkIssues(metrics), // This helper needs to be robust
            qualityTrend: calculateQualityTrend(metrics, timeframe), // This helper needs to be robust
        }
        res.status(200).json({ success: true, timeframe, stats })
    } catch (error) {
        console.error("Get user call stats error:", error)
        res.status(500).json({ success: false, message: "Server error while fetching user call stats" })
    }
}


// --- ADMIN ROUTES CONTROLLERS ---

// Admin: Get all metrics for a specific user (paginated)
exports.getMetricsForUserByAdmin = async (req, res) => {
    try {
        const { userId } = req.params
        const page = parseInt(req.query.page, 10) || 1
        const limit = parseInt(req.query.limit, 10) || 20
        const skip = (page - 1) * limit

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID format" });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const metrics = await CallQualityMetrics.find({ user: userId })
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email') // Optional: populate user details
            .lean()

        const totalMetrics = await CallQualityMetrics.countDocuments({ user: userId })

        res.status(200).json({
            success: true,
            data: metrics,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalMetrics / limit),
                totalItems: totalMetrics,
                itemsPerPage: limit,
            },
        })
    } catch (error) {
        console.error("Admin get user metrics error:", error)
        res.status(500).json({ success: false, message: "Server error fetching user metrics" })
    }
}

// Admin: Get all metrics in the system (paginated)
exports.getAllMetricsByAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1
        const limit = parseInt(req.query.limit, 10) || 20 // Default to 20 items per page
        const skip = (page - 1) * limit

        // Optional filters from query params (e.g., callType, specific date range)
        const filter = {}
        if (req.query.callType) filter.callType = req.query.callType
        if (req.query.startDate && req.query.endDate) {
            filter.timestamp = { $gte: new Date(req.query.startDate), $lte: new Date(req.query.endDate) }
        } else if (req.query.startDate) {
            filter.timestamp = { $gte: new Date(req.query.startDate) }
        } else if (req.query.endDate) {
            filter.timestamp = { $lte: new Date(req.query.endDate) }
        }
        // Add more filters as needed, e.g., by connectionType, networkType, minQualityScore

        const metrics = await CallQualityMetrics.find(filter)
            .sort({ timestamp: -1 }) // Sort by most recent first
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email') // Optional: populate user details
            .lean() // Use .lean() for faster queries if not modifying docs

        const totalMetrics = await CallQualityMetrics.countDocuments(filter)

        res.status(200).json({
            success: true,
            data: metrics,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalMetrics / limit),
                totalItems: totalMetrics,
                itemsPerPage: limit,
            },
        })
    } catch (error) {
        console.error("Admin get all metrics error:", error)
        res.status(500).json({ success: false, message: "Server error fetching all metrics" })
    }
}


// --- HELPER FUNCTIONS (from your existing code, ensure they are robust) ---
function calculateAverage(array, property) {
    const values = array
        .map((item) => {
            if (property.includes(".")) {
                const props = property.split(".")
                let value = item
                for (const prop of props) {
                    value = value?.[prop]
                    if (value === undefined || value === null) return null // Ensure null is handled
                }
                return typeof value === 'number' ? value : null; // Ensure it's a number
            }
            return (typeof item[property] === 'number' && item[property] !== null) ? item[property] : null;
        })
        .filter((value) => value !== null) // Filter out nulls before reducing

    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function countOccurrences(array, property) {
    return array.reduce((counts, item) => {
        const value = item[property]
        if (value !== null && value !== undefined) { // Ensure value exists
            counts[value] = (counts[value] || 0) + 1
        }
        return counts
    }, {})
}

function countNetworkIssues(metrics) {
    return {
        highLatency: metrics.filter((m) => m.rtt && m.rtt > 250).length, // Adjusted threshold
        highJitter: metrics.filter((m) => m.jitter && m.jitter > 30).length, // Adjusted threshold
        highPacketLoss: metrics.filter((m) => m.packetLoss && m.packetLoss > 3).length, // Adjusted threshold
        iceFailures: metrics.filter((m) => ["failed", "disconnected"].includes(m.iceConnectionState)).length,
    }
}

function calculateQualityTrend(metrics, timeframe) {
    if (!metrics || metrics.length === 0) return []
    const intervals = []
    const now = new Date()
    let intervalSizeMs

    switch (timeframe) {
        case "day": intervalSizeMs = 60 * 60 * 1000; break // 1 hour
        case "week": intervalSizeMs = 24 * 60 * 60 * 1000; break // 1 day
        case "month": intervalSizeMs = 24 * 60 * 60 * 1000 * 2; break // 2 days for a month view, adjust as needed
        case "year": intervalSizeMs = 7 * 24 * 60 * 60 * 1000; break // 1 week for a year view
        default: intervalSizeMs = 24 * 60 * 60 * 1000
    }

    const firstTimestamp = metrics[0].timestamp ? new Date(metrics[0].timestamp).getTime() : now.getTime();
    const lastTimestamp = metrics[metrics.length -1].timestamp ? new Date(metrics[metrics.length -1].timestamp).getTime() : now.getTime();

    // Ensure startTime is based on actual data or a reasonable default if metrics are sparse
    let startTime = firstTimestamp;
    if (timeframe === "day") startTime = new Date(now).setHours(0,0,0,0) - (24*60*60*1000) + (now.getTimezoneOffset() * 60000); // Start of yesterday
    else if (timeframe === "week") startTime = new Date(now).setDate(now.getDate() - 7);
    // Add more specific start times if needed

    for (let time = startTime; time <= lastTimestamp + intervalSizeMs; time += intervalSizeMs) {
        intervals.push({ start: new Date(time), end: new Date(time + intervalSizeMs -1), metrics: [] })
    }

    metrics.forEach((metric) => {
        if (!metric.timestamp) return;
        const metricTime = new Date(metric.timestamp).getTime()
        const interval = intervals.find((i) => metricTime >= i.start.getTime() && metricTime < i.end.getTime())
        if (interval) interval.metrics.push(metric)
    })

    return intervals
        .map((interval) => {
            if (interval.metrics.length === 0) return null; // Skip intervals with no data
            return {
                time: interval.start, // Use start of interval as the representative time
                audioQuality: calculateAverage(interval.metrics, "qualityScore.audio"),
                videoQuality: calculateAverage(interval.metrics, "qualityScore.video"),
                rtt: calculateAverage(interval.metrics, "rtt"),
                packetLoss: calculateAverage(interval.metrics, "packetLoss"),
                samples: interval.metrics.length,
            }
        })
        .filter(i => i !== null && i.samples > 0);
}

