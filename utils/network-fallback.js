// Network Fallback Utility - Backend support for handling network issues

class NetworkFallback {
    constructor() {
        this.fallbackStrategies = [
            { name: "ice-restart", description: "Restart ICE connection" },
            { name: "turn-fallback", description: "Switch to TURN relay servers" },
            { name: "bandwidth-reduction", description: "Reduce bandwidth requirements" },
            { name: "audio-only", description: "Switch to audio-only mode" },
        ]

        this.fallbackThresholds = {
            rtt: 500, // ms
            packetLoss: 10, // %
            jitter: 100, // ms
            consecutiveIceFailures: 3,
        }
    }

    // Determine if fallback is needed based on metrics
    needsFallback(metrics) {
        if (!metrics) return false

        // Check for severe network issues
        const hasSevereLatency = metrics.rtt && metrics.rtt > this.fallbackThresholds.rtt
        const hasSeverePacketLoss = metrics.packetLoss && metrics.packetLoss > this.fallbackThresholds.packetLoss
        const hasSevereJitter = metrics.jitter && metrics.jitter > this.fallbackThresholds.jitter
        const hasIceFailure = metrics.iceConnectionState === "failed" || metrics.iceConnectionState === "disconnected"

        return hasSevereLatency || hasSeverePacketLoss || hasSevereJitter || hasIceFailure
    }

    // Get recommended fallback strategy based on metrics
    getRecommendedStrategy(metrics) {
        if (!this.needsFallback(metrics)) {
            return null
        }

        // Determine the best fallback strategy based on the specific issues
        if (metrics.iceConnectionState === "failed" || metrics.iceConnectionState === "disconnected") {
            return {
                strategy: "ice-restart",
                reason: "ICE connection failure",
                severity: "high",
            }
        }

        if (metrics.packetLoss && metrics.packetLoss > this.fallbackThresholds.packetLoss) {
            return {
                strategy: "turn-fallback",
                reason: "High packet loss",
                severity: "high",
                metrics: {
                    packetLoss: metrics.packetLoss,
                },
            }
        }

        if (metrics.rtt && metrics.rtt > this.fallbackThresholds.rtt) {
            return {
                strategy: "bandwidth-reduction",
                reason: "High latency",
                severity: "medium",
                metrics: {
                    rtt: metrics.rtt,
                },
            }
        }

        if (metrics.jitter && metrics.jitter > this.fallbackThresholds.jitter) {
            return {
                strategy: "bandwidth-reduction",
                reason: "High jitter",
                severity: "medium",
                metrics: {
                    jitter: metrics.jitter,
                },
            }
        }

        // Default fallback strategy
        return {
            strategy: "bandwidth-reduction",
            reason: "General network issues",
            severity: "low",
        }
    }

    // Get fallback ICE servers (prioritizing TURN servers)
    async getFallbackIceServers() {
        try {
            // Fetch TURN servers from the server
            const response = await fetch("/api/ice-servers?type=turn", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            })

            const data = await response.json()
            if (!data.success) {
                throw new Error(data.message)
            }

            return data.iceServers
        } catch (error) {
            console.error("Error fetching fallback ICE servers:", error)

            // Return default fallback servers
            return [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]
        }
    }

    // Log fallback event
    async logFallbackEvent(callId, callType, strategy, metrics) {
        try {
            await fetch("/api/call-logs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    callId,
                    callType,
                    eventType: "fallback_activated",
                    metadata: {
                        strategy,
                        metrics,
                    },
                }),
            })
        } catch (error) {
            console.error("Error logging fallback event:", error)
        }
    }
}

module.exports = NetworkFallback
