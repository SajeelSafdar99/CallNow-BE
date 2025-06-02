const IceServer = require("../models/ice-server")

// Get active ICE servers
exports.getIceServers = async (req, res) => {
    try {
        const {region} = req.query;

        // Base filter
        const query = {isActive: true};

        // If the client asks for a specific region (not “global”), include both that region and the global pool
        if (region && region !== "global") {
            query.$or = [{region}, {region: "global"}];
        }

        // Fetch only the fields we need
        const iceServers = await IceServer
            .find(query)
            .sort({priority: -1})
            .select([
                "_id",
                "urls",
                "username",
                "credential",
                "priority",
                "region",
                "serverType",
                "isActive"
            ].join(" "))   // equivalent to .select("urls username credential priority region serverType isActive")
            .lean();        // lean() gives you plain JS objects, slightly faster

        // Map to the structure you want
        const formattedServers = iceServers.map(s => {
            const out = {urls: s.urls};
            if (s._id) out._id = s._id;
            if (s.username) out.username = s.username;
            if (s.credential) out.credential = s.credential;
            if (s.priority) out.priority = s.priority;
            if (s.region) out.region = s.region;
            if (s.serverType) out.serverType = s.serverType;

            return out;
        });

        console.log(formattedServers);
        res.status(200).json({success: true, iceServers: formattedServers});

    } catch (error) {
        console.error("Get ICE servers error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching ICE servers"
        });
    }
};


// Admin: Add ICE server
exports.addIceServer = async (req, res) => {
    try {
        const {urls, username, credential, priority, serverType, region, provider, expiresAt} = req.body

        // Validate input
        if (!urls || !Array.isArray(urls) || urls.length === 0 || !serverType) {
            return res.status(400).json({
                success: false,
                message: "URLs array and server type are required",
            })
        }

        // Create new ICE server
        const newIceServer = new IceServer({
            urls,
            username,
            credential,
            priority: priority || 0,
            serverType,
            region: region || "global",
            provider: provider || "custom",
            expiresAt: expiresAt ? new Date(expiresAt) : null,
        })

        await newIceServer.save()

        res.status(201).json({
            success: true,
            iceServer: newIceServer,
        })
    } catch (error) {
        console.error("Add ICE server error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while adding ICE server",
        })
    }
}

// Admin: Update ICE server
exports.updateIceServer = async (req, res) => {
    try {
        const {id} = req.params
        const {urls, username, credential, priority, isActive, region, provider, expiresAt} = req.body

        // Find ICE server
        const iceServer = await IceServer.findById(id)
        if (!iceServer) {
            return res.status(404).json({
                success: false,
                message: "ICE server not found",
            })
        }

        // Update fields
        if (urls && Array.isArray(urls) && urls.length > 0) iceServer.urls = urls
        if (username !== undefined) iceServer.username = username
        if (credential !== undefined) iceServer.credential = credential
        if (priority !== undefined) iceServer.priority = priority
        if (isActive !== undefined) iceServer.isActive = isActive
        if (region) iceServer.region = region
        if (provider) iceServer.provider = provider
        if (expiresAt) iceServer.expiresAt = new Date(expiresAt)

        await iceServer.save()

        res.status(200).json({
            success: true,
            iceServer,
        })
    } catch (error) {
        console.error("Update ICE server error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating ICE server",
        })
    }
}

// Admin: Delete ICE server
exports.deleteIceServer = async (req, res) => {
    try {
        const {id} = req.params
        const result = await IceServer.findByIdAndDelete(id)
        if (!result) {
            return res.status(404).json({
                success: false,
                message: "ICE server not found",
            })
        }

        res.status(200).json({
            success: true,
            message: "ICE server deleted successfully",
        })
    } catch (error) {
        console.error("Delete ICE server error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while deleting ICE server",
        })
    }
}
