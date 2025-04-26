// Group Call Manager - Utility for managing WebRTC connections in group calls

class GroupCallManager {
    constructor(userId, socket) {
        this.userId = userId
        this.socket = socket
        this.groupCallId = null
        this.peerConnections = new Map() // Map of userId -> RTCPeerConnection
        this.localStream = null
        this.screenStream = null
        this.isScreenSharing = false
        this.remoteStreams = new Map() // Map of userId -> MediaStream
        this.connectionIds = new Map() // Map of userId -> connectionId
        this.callbacks = {
            onRemoteStream: null,
            onRemoteStreamRemoved: null,
            onScreenShareChange: null,
            onParticipantJoined: null,
            onParticipantLeft: null,
            onConnectionStateChange: null,
        }
    }

    // Set callbacks
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks }
    }

    // Initialize group call
    async initializeGroupCall(groupCallId, localStream) {
        this.groupCallId = groupCallId
        this.localStream = localStream
        this.peerConnections = new Map()
        this.remoteStreams = new Map()
        this.connectionIds = new Map()

        // Join group call room
        this.socket.emit("join-group-call", groupCallId)

        // Set up socket listeners for group call
        this.setupSocketListeners()

        return groupCallId
    }

    // Set up socket listeners
    setupSocketListeners() {
        // Handle incoming offer from another participant
        this.socket.on("group-call-offer", async ({ groupCallId, senderId, offer, connectionId }) => {
            if (groupCallId !== this.groupCallId) return

            try {
                // Create new peer connection for this participant
                const peerConnection = await this.createPeerConnection(senderId, connectionId)

                // Set remote description (the offer)
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

                // Create answer
                const answer = await peerConnection.createAnswer()
                await peerConnection.setLocalDescription(answer)

                // Send answer back to the sender
                this.socket.emit("group-call-answer", {
                    groupCallId,
                    receiverId: senderId,
                    answer,
                    connectionId,
                })
            } catch (error) {
                console.error("Error handling group call offer:", error)
            }
        })

        // Handle answer from a participant
        this.socket.on("group-call-answer", async ({ groupCallId, senderId, answer, connectionId }) => {
            if (groupCallId !== this.groupCallId) return

            try {
                const peerConnection = this.peerConnections.get(senderId)
                if (peerConnection) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
                }
            } catch (error) {
                console.error("Error handling group call answer:", error)
            }
        })

        // Handle ICE candidate from a participant
        this.socket.on("group-call-ice-candidate", async ({ groupCallId, senderId, candidate, connectionId }) => {
            if (groupCallId !== this.groupCallId) return

            try {
                const peerConnection = this.peerConnections.get(senderId)
                if (peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                }
            } catch (error) {
                console.error("Error handling group call ICE candidate:", error)
            }
        })

        // Handle new participant joining
        this.socket.on("group-call-user-joined", async ({ groupCallId, user }) => {
            if (groupCallId !== this.groupCallId) return

            try {
                // Create connection with the new participant
                const connectionId = this.generateConnectionId()
                this.connectionIds.set(user._id, connectionId)

                // Create peer connection
                const peerConnection = await this.createPeerConnection(user._id, connectionId)

                // Create offer
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                })
                await peerConnection.setLocalDescription(offer)

                // Send offer to the new participant
                this.socket.emit("group-call-offer", {
                    groupCallId,
                    receiverId: user._id,
                    offer,
                    connectionId,
                })

                // Notify callback
                if (this.callbacks.onParticipantJoined) {
                    this.callbacks.onParticipantJoined(user)
                }
            } catch (error) {
                console.error("Error handling new participant:", error)
            }
        })

        // Handle participant leaving
        this.socket.on("group-call-user-left", ({ groupCallId, userId }) => {
            if (groupCallId !== this.groupCallId) return

            // Close and remove peer connection
            this.closePeerConnection(userId)

            // Notify callback
            if (this.callbacks.onParticipantLeft) {
                this.callbacks.onParticipantLeft(userId)
            }
        })

        // Handle screen sharing status change
        this.socket.on("group-call-screen-sharing", ({ groupCallId, userId, isSharing }) => {
            if (groupCallId !== this.groupCallId) return

            // Notify callback
            if (this.callbacks.onScreenShareChange) {
                this.callbacks.onScreenShareChange(userId, isSharing)
            }
        })
    }

    // Create peer connection for a participant
    async createPeerConnection(participantId, connectionId) {
        // Default ICE servers
        const iceServers = [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
        ]

        // Create new RTCPeerConnection
        const peerConnection = new RTCPeerConnection({ iceServers })

        // Store the connection
        this.peerConnections.set(participantId, peerConnection)

        // Add local stream tracks to the connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.localStream)
            })
        }

        // Add screen sharing stream if active
        if (this.isScreenSharing && this.screenStream) {
            this.screenStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.screenStream)
            })
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit("group-call-ice-candidate", {
                    groupCallId: this.groupCallId,
                    receiverId: participantId,
                    candidate: event.candidate,
                    connectionId,
                })
            }
        }

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                const remoteStream = event.streams[0]
                this.remoteStreams.set(participantId, remoteStream)

                // Notify callback
                if (this.callbacks.onRemoteStream) {
                    this.callbacks.onRemoteStream(participantId, remoteStream)
                }
            }
        }

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange(participantId, peerConnection.connectionState)
            }

            // Clean up if connection failed or closed
            if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
                this.closePeerConnection(participantId)
            }
        }

        return peerConnection
    }

    // Close and clean up a peer connection
    closePeerConnection(participantId) {
        const peerConnection = this.peerConnections.get(participantId)
        if (peerConnection) {
            peerConnection.close()
            this.peerConnections.delete(participantId)
        }

        // Remove remote stream
        const remoteStream = this.remoteStreams.get(participantId)
        if (remoteStream) {
            remoteStream.getTracks().forEach((track) => track.stop())
            this.remoteStreams.delete(participantId)

            // Notify callback
            if (this.callbacks.onRemoteStreamRemoved) {
                this.callbacks.onRemoteStreamRemoved(participantId)
            }
        }

        // Remove connection ID
        this.connectionIds.delete(participantId)
    }

    // Start screen sharing
    async startScreenSharing() {
        try {
            // Get screen sharing stream
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                },
                audio: false,
            })

            // Update screen sharing state
            this.isScreenSharing = true

            // Add screen track to all existing peer connections
            const videoTrack = this.screenStream.getVideoTracks()[0]
            for (const [participantId, peerConnection] of this.peerConnections.entries()) {
                peerConnection.getSenders().forEach((sender) => {
                    if (sender.track && sender.track.kind === "video") {
                        sender.replaceTrack(videoTrack)
                    }
                })
            }

            // Notify server about screen sharing
            await this.updateScreenSharingStatus(true)

            // Handle screen sharing stopped by user (browser UI)
            videoTrack.onended = () => {
                this.stopScreenSharing()
            }

            return true
        } catch (error) {
            console.error("Error starting screen sharing:", error)
            return false
        }
    }

    // Stop screen sharing
    async stopScreenSharing() {
        if (!this.isScreenSharing || !this.screenStream) return false

        try {
            // Stop all tracks in screen stream
            this.screenStream.getTracks().forEach((track) => track.stop())

            // Replace screen track with camera track in all peer connections
            if (this.localStream) {
                const videoTrack = this.localStream.getVideoTracks()[0]
                if (videoTrack) {
                    for (const [participantId, peerConnection] of this.peerConnections.entries()) {
                        peerConnection.getSenders().forEach((sender) => {
                            if (sender.track && sender.track.kind === "video") {
                                sender.replaceTrack(videoTrack)
                            }
                        })
                    }
                }
            }

            // Update screen sharing state
            this.isScreenSharing = false
            this.screenStream = null

            // Notify server about screen sharing stopped
            await this.updateScreenSharingStatus(false)

            return true
        } catch (error) {
            console.error("Error stopping screen sharing:", error)
            return false
        }
    }

    // Update screen sharing status on server
    async updateScreenSharingStatus(isSharing) {
        try {
            // Notify all participants via socket
            this.socket.emit("group-call-screen-sharing", {
                groupCallId: this.groupCallId,
                isSharing,
            })

            // Update server via API
            const response = await fetch(`/api/group-calls/${this.groupCallId}/screen`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ isSharing }),
            })

            const data = await response.json()
            if (!data.success) {
                throw new Error(data.message)
            }

            return true
        } catch (error) {
            console.error("Error updating screen sharing status:", error)
            return false
        }
    }

    // Join an existing group call
    async joinGroupCall(groupCallId, participants, localStream) {
        try {
            // Initialize group call
            await this.initializeGroupCall(groupCallId, localStream)

            // Create connections with all existing participants
            for (const participant of participants) {
                if (participant.user._id !== this.userId && participant.isActive) {
                    const connectionId = this.generateConnectionId()
                    this.connectionIds.set(participant.user._id, connectionId)

                    // Create peer connection
                    const peerConnection = await this.createPeerConnection(participant.user._id, connectionId)

                    // Create offer
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true,
                    })
                    await peerConnection.setLocalDescription(offer)

                    // Send offer to the participant
                    this.socket.emit("group-call-offer", {
                        groupCallId,
                        receiverId: participant.user._id,
                        offer,
                        connectionId,
                    })
                }
            }

            // Notify server about joining
            const connectionIds = Array.from(this.connectionIds.values())
            await this.updateConnectionIds(connectionIds)

            // Notify all participants about joining
            this.socket.emit("group-call-user-joined", {
                groupCallId,
                user: {
                    _id: this.userId,
                },
            })

            return true
        } catch (error) {
            console.error("Error joining group call:", error)
            return false
        }
    }

    // Leave group call
    async leaveGroupCall() {
        try {
            if (!this.groupCallId) return false

            // Close all peer connections
            for (const [participantId, peerConnection] of this.peerConnections.entries()) {
                this.closePeerConnection(participantId)
            }

            // Stop screen sharing if active
            if (this.isScreenSharing) {
                await this.stopScreenSharing()
            }

            // Leave group call room
            this.socket.emit("leave-group-call", this.groupCallId)

            // Notify all participants about leaving
            this.socket.emit("group-call-user-left", {
                groupCallId: this.groupCallId,
                userId: this.userId,
            })

            // Notify server via API
            const response = await fetch(`/api/group-calls/${this.groupCallId}/leave`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            })

            const data = await response.json()
            if (!data.success) {
                throw new Error(data.message)
            }

            // Reset state
            this.groupCallId = null
            this.peerConnections = new Map()
            this.remoteStreams = new Map()
            this.connectionIds = new Map()

            return true
        } catch (error) {
            console.error("Error leaving group call:", error)
            return false
        }
    }

    // End group call (only for initiator)
    async endGroupCall() {
        try {
            if (!this.groupCallId) return false

            // Notify server via API
            const response = await fetch(`/api/group-calls/${this.groupCallId}/end`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            })

            const data = await response.json()
            if (!data.success) {
                throw new Error(data.message)
            }

            // Leave group call
            await this.leaveGroupCall()

            return true
        } catch (error) {
            console.error("Error ending group call:", error)
            return false
        }
    }

    // Update connection IDs on server
    async updateConnectionIds(connectionIds) {
        try {
            const response = await fetch(`/api/group-calls/${this.groupCallId}/connections`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ connectionIds }),
            })

            const data = await response.json()
            if (!data.success) {
                throw new Error(data.message)
            }

            return true
        } catch (error) {
            console.error("Error updating connection IDs:", error)
            return false
        }
    }

    // Generate a unique connection ID
    generateConnectionId() {
        return `${this.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    // Toggle audio
    toggleAudio(mute) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = !mute
            })
        }
    }

    // Toggle video
    toggleVideo(disable) {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach((track) => {
                track.enabled = !disable
            })
        }
    }

    // Get all remote streams
    getAllRemoteStreams() {
        return this.remoteStreams
    }

    // Get local stream
    getLocalStream() {
        return this.localStream
    }

    // Get screen stream
    getScreenStream() {
        return this.screenStream
    }

    // Clean up resources
    cleanup() {
        // Leave group call if active
        if (this.groupCallId) {
            this.leaveGroupCall()
        }

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop())
            this.localStream = null
        }

        // Stop screen stream
        if (this.screenStream) {
            this.screenStream.getTracks().forEach((track) => track.stop())
            this.screenStream = null
        }

        // Remove socket listeners
        this.socket.off("group-call-offer")
        this.socket.off("group-call-answer")
        this.socket.off("group-call-ice-candidate")
        this.socket.off("group-call-user-joined")
        this.socket.off("group-call-user-left")
        this.socket.off("group-call-screen-sharing")
    }
}

module.exports = GroupCallManager
