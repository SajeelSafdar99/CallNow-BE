// WebRTC utility functions for client-side implementation

// Initialize WebRTC peer connection
const initializePeerConnection = (iceServers = []) => {
    // Default ICE servers if none provided
    const defaultIceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
    ]

    // Create RTCPeerConnection with ICE servers
    const peerConnection = new RTCPeerConnection({
        iceServers: iceServers.length > 0 ? iceServers : defaultIceServers,
    })

    return peerConnection
}

// Create offer for initiating a call
const createOffer = async (peerConnection) => {
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        })
        await peerConnection.setLocalDescription(offer)
        return offer
    } catch (error) {
        console.error("Error creating offer:", error)
        throw error
    }
}

// Create answer for responding to a call
const createAnswer = async (peerConnection, offer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)
        return answer
    } catch (error) {
        console.error("Error creating answer:", error)
        throw error
    }
}

// Add ICE candidate
const addIceCandidate = async (peerConnection, candidate) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
        console.error("Error adding ICE candidate:", error)
        throw error
    }
}

// Get local media stream (audio and/or video)
const getLocalMediaStream = async (constraints = { audio: true, video: true }) => {
    try {
        return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
        console.error("Error getting local media stream:", error)
        throw error
    }
}

// Get screen sharing stream
const getScreenSharingStream = async () => {
    try {
        return await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
            },
            audio: false,
        })
    } catch (error) {
        console.error("Error getting screen sharing stream:", error)
        throw error
    }
}

// Add local media stream to peer connection
const addLocalStreamToPeerConnection = (peerConnection, stream) => {
    stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream)
    })
}

// Replace video track in peer connection
const replaceVideoTrack = async (peerConnection, newStream) => {
    const videoTrack = newStream.getVideoTracks()[0]
    if (!videoTrack) return false

    const senders = peerConnection.getSenders()
    const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video")

    if (videoSender) {
        await videoSender.replaceTrack(videoTrack)
        return true
    }

    return false
}

// Handle remote stream
const handleRemoteStream = (peerConnection, onRemoteStream) => {
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            onRemoteStream(event.streams[0])
        }
    }
}

// Handle ICE candidates
const handleIceCandidates = (peerConnection, onIceCandidate) => {
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            onIceCandidate(event.candidate)
        }
    }
}

// Handle connection state changes
const handleConnectionStateChange = (peerConnection, onStateChange) => {
    peerConnection.onconnectionstatechange = () => {
        onStateChange(peerConnection.connectionState)
    }
}

// Handle ICE connection state changes
const handleIceConnectionStateChange = (peerConnection, onStateChange) => {
    peerConnection.oniceconnectionstatechange = () => {
        onStateChange(peerConnection.iceConnectionState)
    }
}

// Close peer connection and clean up
const closePeerConnection = (peerConnection, stream) => {
    if (stream) {
        stream.getTracks().forEach((track) => {
            track.stop()
        })
    }

    if (peerConnection) {
        peerConnection.close()
    }
}

module.exports = {
    initializePeerConnection,
    createOffer,
    createAnswer,
    addIceCandidate,
    getLocalMediaStream,
    getScreenSharingStream,
    addLocalStreamToPeerConnection,
    replaceVideoTrack,
    handleRemoteStream,
    handleIceCandidates,
    handleConnectionStateChange,
    handleIceConnectionStateChange,
    closePeerConnection,
}
