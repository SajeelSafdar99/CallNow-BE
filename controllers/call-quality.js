const CallQualityMetrics = require("../models/call-quality-metrics")
const Call = require("../models/call")
const GroupCall = require("../models/group-call")

// Record call quality metrics
exports.recordMetrics = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { callId, callType, metrics } = req.body

        // Validate input
        if (!callId || !callType || !metrics) {
            return res.status(400).json({
                success: false,
                message: "Call ID, call type, and metrics are required",
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

        // Create new metrics record
        const newMetrics = new CallQualityMetrics({
            callId,
            callType,
            user: userId,
            ...metrics,
        })

        await newMetrics.save()

        res.status(201).json({
            success: true,
            message: "Call quality metrics recorded successfully",
        })
    } catch (error) {
        console.error("Record call quality metrics error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while recording call quality metrics",
        })
    }
}

// Get call quality metrics for a specific call
exports.getCallMetrics = async (req, res) => {
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

        // Get metrics for this call
        const metrics = await CallQualityMetrics.find({ callId, callType }).sort({ timestamp: 1 })

        // Process metrics to create a summary
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
            iceStates: countOccurrences(metrics, "iceConnectionState"),
            timeline: metrics.map((m) => ({
                timestamp: m.timestamp,
                user: m.user,
                rtt: m.rtt,
                jitter: m.jitter,
                packetLoss: m.packetLoss,
                iceConnectionState: m.iceConnectionState,
                qualityScore: m.qualityScore,
            })),
        }

        res.status(200).json({
            success: true,
            summary,
        })
    } catch (error) {
        console.error("Get call metrics error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching call metrics",
        })
    }
}

// Get user's call quality statistics
exports.getUserCallStats = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { timeframe = "week" } = req.query

        // Determine date range based on timeframe
        const now = new Date()
        const startDate = new Date()

        switch (timeframe) {
            case "day":
                startDate.setDate(now.getDate() - 1)
                break
            case "week":
                startDate.setDate(now.getDate() - 7)
                break
            case "month":
                startDate.setMonth(now.getMonth() - 1)
                break
            case "year":
                startDate.setFullYear(now.getFullYear() - 1)
                break
            default:
                startDate.setDate(now.getDate() - 7) // Default to week
        }

        // Get metrics for this user within the timeframe
        const metrics = await CallQualityMetrics.find({
            user: userId,
            timestamp: { $gte: startDate },
        }).sort({ timestamp: 1 })

        // Process metrics to create statistics
        const stats = {
            totalCalls: new Set(metrics.map((m) => m.callId.toString())).size,
            totalSamples: metrics.length,
            averages: {
                rtt: calculateAverage(metrics, "rtt"),
                jitter: calculateAverage(metrics, "jitter"),
                packetLoss: calculateAverage(metrics, "packetLoss"),
                audioQuality: calculateAverage(metrics, "qualityScore.audio"),
                videoQuality: calculateAverage(metrics, "qualityScore.video"),
            },
            connectionTypes: countOccurrences(metrics, "connectionType"),
            networkIssues: countNetworkIssues(metrics),
            qualityTrend: calculateQualityTrend(metrics, timeframe),
        }

        res.status(200).json({
            success: true,
            timeframe,
            stats,
        })
    } catch (error) {
        console.error("Get user call stats error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching user call statistics",
        })
    }
}

// Helper function to calculate average of a property
function calculateAverage(array, property) {
    const values = array
        .map((item) => {
            // Handle nested properties like 'bitrate.audio'
            if (property.includes(".")) {
                const props = property.split(".")
                let value = item
                for (const prop of props) {
                    value = value?.[prop]
                    if (value === undefined) return null
                }
                return value
            }
            return item[property]
        })
        .filter((value) => value !== null && value !== undefined)

    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

// Helper function to count occurrences of values for a property
function countOccurrences(array, property) {
    return array.reduce((counts, item) => {
        const value = item[property]
        if (value) {
            counts[value] = (counts[value] || 0) + 1
        }
        return counts
    }, {})
}

// Helper function to count network issues
function countNetworkIssues(metrics) {
    return {
        highLatency: metrics.filter((m) => m.rtt && m.rtt > 300).length,
        highJitter: metrics.filter((m) => m.jitter && m.jitter > 50).length,
        highPacketLoss: metrics.filter((m) => m.packetLoss && m.packetLoss > 5).length,
        iceFailures: metrics.filter((m) => m.iceConnectionState === "failed" || m.iceConnectionState === "disconnected")
            .length,
    }
}

// Helper function to calculate quality trend over time
function calculateQualityTrend(metrics, timeframe) {
    if (metrics.length === 0) return []

    // Group metrics by time intervals based on timeframe
    const intervals = []
    const now = new Date()
    let intervalSize

    switch (timeframe) {
        case "day":
            intervalSize = 60 * 60 * 1000 // 1 hour in ms
            break
        case "week":
            intervalSize = 24 * 60 * 60 * 1000 // 1 day in ms
            break
        case "month":
            intervalSize = 24 * 60 * 60 * 1000 // 1 day in ms
            break
        case "year":
            intervalSize = 30 * 24 * 60 * 60 * 1000 // 30 days in ms
            break
        default:
            intervalSize = 24 * 60 * 60 * 1000 // Default to 1 day
    }

    // Create intervals
    const startTime = metrics[0].timestamp.getTime()
    const endTime = now.getTime()

    for (let time = startTime; time <= endTime; time += intervalSize) {
        intervals.push({
            start: new Date(time),
            end: new Date(time + intervalSize),
            metrics: [],
        })
    }

    // Assign metrics to intervals
    metrics.forEach((metric) => {
        const metricTime = metric.timestamp.getTime()
        const interval = intervals.find((i) => metricTime >= i.start.getTime() && metricTime < i.end.getTime())
        if (interval) {
            interval.metrics.push(metric)
        }
    })

    // Calculate averages for each interval
    return intervals
        .map((interval) => {
            const audioQuality = calculateAverage(interval.metrics, "qualityScore.audio") || 0
            const videoQuality = calculateAverage(interval.metrics, "qualityScore.video") || 0
            const rtt = calculateAverage(interval.metrics, "rtt") || 0
            const packetLoss = calculateAverage(interval.metrics, "packetLoss") || 0

            return {
                time: interval.start,
                audioQuality,
                videoQuality,
                rtt,
                packetLoss,
                samples: interval.metrics.length,
            }
        })
        .filter((i) => i.samples > 0) // Only include intervals with data
}
