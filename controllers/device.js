const User = require("../models/user")

// Get all devices for the current user
exports.getDevices = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        const user = await User.findById(userId).select("devices activeDevice")
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.status(200).json({
            success: true,
            devices: user.devices,
            activeDevice: user.activeDevice,
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

        // Update active device
        user.activeDevice = deviceId
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

        // Find user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if device exists
        const deviceExists = user.devices.some((device) => device.deviceId === deviceId)
        if (!deviceExists) {
            return res.status(404).json({
                success: false,
                message: "Device not found for this user",
            })
        }

        // Remove device from devices array
        user.devices = user.devices.filter((device) => device.deviceId !== deviceId)

        // If removed device was the active device, set active device to null or another device
        if (user.activeDevice === deviceId) {
            user.activeDevice = user.devices.length > 0 ? user.devices[0].deviceId : null
        }

        await user.save()

        res.status(200).json({
            success: true,
            message: "Device removed successfully",
            devices: user.devices,
            activeDevice: user.activeDevice,
        })
    } catch (error) {
        console.error("Remove device error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while removing device",
        })
    }
}

// Update device name
exports.updateDeviceName = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { deviceId } = req.params
        const { deviceName } = req.body

        if (!deviceName) {
            return res.status(400).json({
                success: false,
                message: "Device name is required",
            })
        }

        // Find user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Find and update device
        const deviceIndex = user.devices.findIndex((device) => device.deviceId === deviceId)
        if (deviceIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Device not found for this user",
            })
        }

        // Update device name
        user.devices[deviceIndex].deviceName = deviceName
        user.devices[deviceIndex].lastActive = new Date()
        await user.save()

        res.status(200).json({
            success: true,
            message: "Device name updated successfully",
            device: user.devices[deviceIndex],
        })
    } catch (error) {
        console.error("Update device name error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating device name",
        })
    }
}

// Update last active timestamp for device
exports.updateDeviceActivity = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { deviceId } = req.params

        // Find user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Find device
        const deviceIndex = user.devices.findIndex((device) => device.deviceId === deviceId)
        if (deviceIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Device not found for this user",
            })
        }

        // Update last active timestamp
        user.devices[deviceIndex].lastActive = new Date()
        await user.save()

        res.status(200).json({
            success: true,
            message: "Device activity updated successfully",
        })
    } catch (error) {
        console.error("Update device activity error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating device activity",
        })
    }
}
