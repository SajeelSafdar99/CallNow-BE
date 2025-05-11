const User = require("../models/user")

// Get all devices for the current user
exports.getDevices = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Debug: Log the activeDevice value
        console.log("Active device in DB:", user.activeDevice);
        console.log("Devices before update:", JSON.stringify(user.devices));

        // Make sure device active status is consistent with activeDevice field
        if (user.activeDevice) {
            user.devices = user.devices.map(device => ({
                ...device.toObject ? device.toObject() : device, // Convert to plain object if it's a Mongoose document
                isActive: device.deviceId === user.activeDevice
            }))

            // Debug: Log the updated devices
            console.log("Devices after update:", JSON.stringify(user.devices));

            // Save the updated devices array if there were any inconsistencies
            const needsUpdate = user.devices.some(device =>
                (device.deviceId === user.activeDevice && !device.isActive) ||
                (device.deviceId !== user.activeDevice && device.isActive)
            )

            if (needsUpdate) {
                await user.save()
            }
        }

        res.status(200).json({
            success: true,
            devices: user.devices,
            activeDevice: user.activeDevice // Make sure to include this in the response
        })
    } catch (error) {
        console.error("Get devices error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching devices",
        })
    }
}
// Set active device
exports.setActiveDevice = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { deviceId } = req.params

        // Check if device exists for this user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        const deviceExists = user.devices.some((device) => device.deviceId === deviceId)
        if (!deviceExists) {
            return res.status(404).json({
                success: false,
                message: "Device not found for this user",
            })
        }

        // Update active device status for all devices
        user.devices = user.devices.map(device => ({
            ...device,
            isActive: device.deviceId === deviceId
        }))

        // Update active device field
        user.activeDevice = deviceId

        // Update last active timestamp for the device
        const deviceIndex = user.devices.findIndex(device => device.deviceId === deviceId)
        if (deviceIndex !== -1) {
            user.devices[deviceIndex].lastActive = new Date()
        }

        await user.save()

        res.status(200).json({
            success: true,
            message: "Active device updated successfully",
            activeDevice: deviceId,
        })
    } catch (error) {
        console.error("Set active device error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while setting active device",
        })
    }
}
// Remove device
exports.removeDevice = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { deviceId } = req.params

        // Check if device exists for this user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        const deviceExists = user.devices.some((device) => device.deviceId === deviceId)
        if (!deviceExists) {
            return res.status(404).json({
                success: false,
                message: "Device not found for this user",
            })
        }

        // Remove the device
        user.devices = user.devices.filter((device) => device.deviceId !== deviceId)

        // If the removed device was the active device, set a new active device if available
        if (user.activeDevice === deviceId && user.devices.length > 0) {
            user.activeDevice = user.devices[0].deviceId
            user.devices[0].isActive = true
        } else if (user.devices.length === 0) {
            user.activeDevice = ""
        }

        await user.save()

        res.status(200).json({
            success: true,
            message: "Device removed successfully",
        })
    } catch (error) {
        console.error("Remove device error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while removing device",
        })
    }
}
exports.logoutAllOtherDevices = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { currentDeviceId } = req.params

        if (!currentDeviceId) {
            return res.status(400).json({
                success: false,
                message: "Current device ID is required",
            })
        }

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if current device exists
        const currentDevice = user.devices.find((device) => device.deviceId === currentDeviceId)
        if (!currentDevice) {
            return res.status(404).json({
                success: false,
                message: "Current device not found",
            })
        }

        // Keep only the current device
        user.devices = user.devices.filter((device) => device.deviceId === currentDeviceId)

        // Set the current device as active
        user.activeDevice = currentDeviceId
        user.devices[0].isActive = true
        user.devices[0].lastActive = new Date()

        await user.save()

        res.status(200).json({
            success: true,
            message: "Logged out from all other devices successfully",
        })
    } catch (error) {
        console.error("Logout all other devices error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while logging out from other devices",
        })
    }
}