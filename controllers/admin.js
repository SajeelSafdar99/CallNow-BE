const User = require("../models/user")
const { adminSocketFunctions } = require("../utils/admin-socket-functions")
const {isUserActive, getActiveUsersCount} = require("../utils/socket-utils"); // Import socket functions

// Suspend a user account
exports.suspendUser = async (req, res) => {
    try {
        const { userId } = req.params
        const { reason, duration } = req.body // duration in hours, optional
        const adminId = req.userId

        // Validate input
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required",
            })
        }

        // Check if target user exists
        const targetUser = await User.findById(userId)
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Prevent admin from suspending themselves
        if (targetUser._id.toString() === adminId) {
            return res.status(400).json({
                success: false,
                message: "You cannot suspend your own account",
            })
        }

        // Prevent suspending other admins
        if (targetUser.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Cannot suspend another admin account",
            })
        }

        // Check if already suspended
        if (targetUser.isSuspended && !targetUser.isSuspensionExpired()) {
            return res.status(400).json({
                success: false,
                message: "User is already suspended",
            })
        }

        // Set suspension details
        targetUser.isSuspended = true
        targetUser.suspensionDetails = {
            suspendedAt: new Date(),
            suspendedBy: adminId,
            reason: reason || "No reason provided",
        }

        // If duration is provided, set expiration
        if (duration && duration > 0) {
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + duration)
            targetUser.suspensionDetails.expiresAt = expiresAt
        }

        await targetUser.save()

        // Prepare suspension details for notification
        const suspensionDetails = {
            suspendedAt: targetUser.suspensionDetails.suspendedAt,
            reason: targetUser.suspensionDetails.reason,
            expiresAt: targetUser.suspensionDetails.expiresAt,
        }

        // Notify user via socket if they're online
        adminSocketFunctions.notifyUserSuspension(userId, suspensionDetails)

        // Notify admins about the suspension
        adminSocketFunctions.notifyAdmins("admin:user-suspended", {
            userId: targetUser._id,
            phoneNumber: targetUser.phoneNumber,
            name: targetUser.name,
            suspensionDetails,
            suspendedBy: {
                id: adminId,
            },
        })

        // Update admin dashboard
        adminSocketFunctions.updateAdminDashboard({
            type: "user-suspended",
            user: {
                id: targetUser._id,
                phoneNumber: targetUser.phoneNumber,
                name: targetUser.name,
            },
        })

        res.status(200).json({
            success: true,
            message: "User account suspended successfully",
            suspension: {
                userId: targetUser._id,
                phoneNumber: targetUser.phoneNumber,
                suspendedAt: targetUser.suspensionDetails.suspendedAt,
                reason: targetUser.suspensionDetails.reason,
                expiresAt: targetUser.suspensionDetails.expiresAt,
                userNotified: isUserActive(userId),
            },
        })
    } catch (error) {
        console.error("Suspend user error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while suspending user",
        })
    }
}

// Unsuspend a user account
exports.unsuspendUser = async (req, res) => {
    try {
        const { userId } = req.params

        // Validate input
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required",
            })
        }

        // Check if target user exists
        const targetUser = await User.findById(userId)
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if user is suspended
        if (!targetUser.isSuspended) {
            return res.status(400).json({
                success: false,
                message: "User is not suspended",
            })
        }

        // Remove suspension
        targetUser.isSuspended = false
        targetUser.suspensionDetails = undefined

        await targetUser.save()

        // Notify user via socket if they're online
        adminSocketFunctions.notifyUserUnsuspension(userId)

        // Notify admins about the unsuspension
        adminSocketFunctions.notifyAdmins("admin:user-unsuspended", {
            userId: targetUser._id,
            phoneNumber: targetUser.phoneNumber,
            name: targetUser.name,
            unsuspendedBy: {
                id: req.userId,
            },
        })

        // Update admin dashboard
        adminSocketFunctions.updateAdminDashboard({
            type: "user-unsuspended",
            user: {
                id: targetUser._id,
                phoneNumber: targetUser.phoneNumber,
                name: targetUser.name,
            },
        })

        res.status(200).json({
            success: true,
            message: "User account unsuspended successfully",
            user: {
                userId: targetUser._id,
                phoneNumber: targetUser.phoneNumber,
                name: targetUser.name,
            },
            userNotified: isUserActive(userId),
        })
    } catch (error) {
        console.error("Unsuspend user error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while unsuspending user",
        })
    }
}

// Get all users (with pagination and filters)
exports.getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            filter = "all", // all, active, suspended, unverified
        } = req.query

        // Build query
        const query = {}

        // Search by phone number or name
        if (search) {
            query.$or = [{ phoneNumber: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }]
        }

        // Apply filters
        switch (filter) {
            case "active":
                query.isVerified = true
                query.isSuspended = false
                break
            case "suspended":
                query.isSuspended = true
                break
            case "unverified":
                query.isVerified = false
                break
        }

        // Calculate pagination
        const skip = (page - 1) * limit

        // Get users
        const users = await User.find(query)
            .select("-password")
            .populate("suspensionDetails.suspendedBy", "name phoneNumber")
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip(skip)

        // Get total count
        const totalUsers = await User.countDocuments(query)

        // Add online status to users with safety check
        const usersWithStatus = users.map((user) => {
            let isOnline = false
            try {
                // Use the new socketUtils module instead of adminSocketFunctions
                isOnline = isUserActive(user._id.toString())
            } catch (error) {
                console.error(`Error checking online status for user ${user._id}:`, error)
            }

            return {
                ...user.toObject(),
                isOnline,
            }
        })

        res.status(200).json({
            success: true,
            users: usersWithStatus,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalUsers / limit),
                totalUsers,
                hasMore: skip + users.length < totalUsers,
            },
        })
    } catch (error) {
        console.error("Get users error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching users",
        })
    }
}
// Get suspended users
exports.getSuspendedUsers = async (req, res) => {
    try {
        const suspendedUsers = await User.find({ isSuspended: true })
            .select("-password")
            .populate("suspensionDetails.suspendedBy", "name phoneNumber")
            .sort({ "suspensionDetails.suspendedAt": -1 })

        res.status(200).json({
            success: true,
            count: suspendedUsers.length,
            users: suspendedUsers,
        })
    } catch (error) {
        console.error("Get suspended users error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching suspended users",
        })
    }
}

// Get user details
exports.getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params

        const user = await User.findById(userId)
            .select("-password")
            .populate("suspensionDetails.suspendedBy", "name phoneNumber")
            .populate("subscriptionId")

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Add online status with safety check
        let isOnline = false
        try {
            // Use the new socketUtils module
            isOnline = isUserActive(userId)
        } catch (error) {
            console.error(`Error checking online status for user ${userId}:`, error)
        }

        const userWithStatus = {
            ...user.toObject(),
            isOnline,
        }

        res.status(200).json({
            success: true,
            user: userWithStatus,
        })
    } catch (error) {
        console.error("Get user details error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching user details",
        })
    }
}
// Get admin dashboard stats
exports.getDashboardStats = async (req, res) => {
    try {
        // Get user stats
        const totalUsers = await User.countDocuments()
        const verifiedUsers = await User.countDocuments({ isVerified: true })
        const suspendedUsers = await User.countDocuments({ isSuspended: true })
        const adminUsers = await User.countDocuments({ isAdmin: true })

        // Get active users count with safety check
        let activeUsersCount = 0
        try {
            // Use the new socketUtils module
            activeUsersCount = getActiveUsersCount()
        } catch (error) {
            console.error("Error getting active users count:", error)
        }
        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                verifiedUsers,
                suspendedUsers,
                adminUsers,
                activeUsers: activeUsersCount,
                unverifiedUsers: totalUsers - verifiedUsers,
            },
        })
    } catch (error) {
        console.error("Get dashboard stats error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching dashboard stats",
        })
    }
}