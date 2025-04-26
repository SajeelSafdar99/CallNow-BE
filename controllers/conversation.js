const Conversation = require("../models/conversation")
const User = require("../models/user")
const mongoose = require("mongoose")
const fs = require("fs")
const path = require("path")

// Create or get one-to-one conversation
exports.getOrCreateConversation = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { recipientId } = req.body

        // Validate input
        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: "Recipient ID is required",
            })
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId)
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: "Recipient not found",
            })
        }

        // Check if conversation already exists
        const existingConversation = await Conversation.findOne({
            participants: { $all: [userId, recipientId] },
            isGroup: false,
        })
            .populate("participants", "_id name phoneNumber profilePicture")
            .populate({
                path: "lastMessage",
                select: "content contentType sender createdAt",
                populate: {
                    path: "sender",
                    select: "_id name",
                },
            })

        if (existingConversation) {
            return res.status(200).json({
                success: true,
                conversation: existingConversation,
            })
        }

        // Create new conversation
        const newConversation = new Conversation({
            participants: [userId, recipientId],
            isGroup: false,
            unreadCounts: [
                { user: userId, count: 0 },
                { user: recipientId, count: 0 },
            ],
        })

        await newConversation.save()

        // Populate the participants
        await newConversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(201).json({
            success: true,
            conversation: newConversation,
        })
    } catch (error) {
        console.error("Get or create conversation error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while creating conversation",
        })
    }
}

// Get all conversations for a user
exports.getConversations = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        // Find all conversations where the user is a participant
        const conversations = await Conversation.find({
            participants: userId,
        })
            .populate("participants", "_id name phoneNumber profilePicture")
            .populate({
                path: "lastMessage",
                select: "content contentType sender createdAt",
                populate: {
                    path: "sender",
                    select: "_id name",
                },
            })
            .sort({ updatedAt: -1 }) // Sort by most recent activity

        res.status(200).json({
            success: true,
            conversations,
        })
    } catch (error) {
        console.error("Get conversations error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching conversations",
        })
    }
}

// Create group conversation
exports.createGroupConversation = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { name, participants, description } = req.body

        // Validate input
        if (!name || !participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Group name and at least one participant are required",
            })
        }

        // Make sure all participants exist
        const participantIds = [...participants, userId] // Include the creator
        const uniqueParticipantIds = [...new Set(participantIds)] // Remove duplicates

        const users = await User.find({ _id: { $in: uniqueParticipantIds } })
        if (users.length !== uniqueParticipantIds.length) {
            return res.status(400).json({
                success: false,
                message: "One or more participants do not exist",
            })
        }

        // Create unreadCounts array for all participants
        const unreadCounts = uniqueParticipantIds.map((id) => ({
            user: id,
            count: 0,
        }))

        // Create new group conversation
        const newGroupConversation = new Conversation({
            participants: uniqueParticipantIds,
            isGroup: true,
            groupName: name,
            groupAdmin: userId,
            groupDescription: description || "",
            unreadCounts,
        })

        await newGroupConversation.save()

        // Populate the participants
        await newGroupConversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(201).json({
            success: true,
            conversation: newGroupConversation,
        })
    } catch (error) {
        console.error("Create group conversation error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while creating group conversation",
        })
    }
}

// Update group conversation
exports.updateGroupConversation = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params
        const { name, description } = req.body

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is admin
        if (conversation.groupAdmin.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only group admin can update group details",
            })
        }

        // Update group details
        if (name) conversation.groupName = name
        if (description) conversation.groupDescription = description

        await conversation.save()

        // Populate the participants
        await conversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            conversation,
        })
    } catch (error) {
        console.error("Update group conversation error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating group conversation",
        })
    }
}

// Update group image
exports.updateGroupImage = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is admin
        if (conversation.groupAdmin.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only group admin can update group image",
            })
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided",
            })
        }

        // Get the file path
        const groupImagePath = `/uploads/groups/${req.file.filename}`

        // Delete old image if exists
        if (conversation.groupImage) {
            const oldImagePath = path.join(__dirname, "..", "public", conversation.groupImage)
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath)
            }
        }

        // Update group image
        conversation.groupImage = groupImagePath
        await conversation.save()

        // Populate the participants
        await conversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            message: "Group image updated successfully",
            conversation,
        })
    } catch (error) {
        console.error("Update group image error:", error)

        // Delete the uploaded file if there was an error
        if (req.file) {
            const filePath = path.join(__dirname, "..", "public", `/uploads/groups/${req.file.filename}`)
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
        }

        res.status(500).json({
            success: false,
            message: "Server error while updating group image",
        })
    }
}

// Add participants to group
exports.addParticipants = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params
        const { participants } = req.body

        // Validate input
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one participant is required",
            })
        }

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is admin
        if (conversation.groupAdmin.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only group admin can add participants",
            })
        }

        // Make sure all new participants exist
        const users = await User.find({ _id: { $in: participants } })
        if (users.length !== participants.length) {
            return res.status(400).json({
                success: false,
                message: "One or more participants do not exist",
            })
        }

        // Filter out participants that are already in the group
        const newParticipants = participants.filter((p) =>
            !conversation.participants.includes(new mongoose.Types.ObjectId(p))
        )

        if (newParticipants.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All participants are already in the group",
            })
        }

        // Add new participants
        conversation.participants.push(...newParticipants)

        // Add unreadCounts for new participants
        newParticipants.forEach((participantId) => {
            conversation.unreadCounts.push({
                user: participantId,
                count: 0,
            })
        })

        await conversation.save()

        // Populate the participants
        await conversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            conversation,
        })
    } catch (error) {
        console.error("Add participants error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while adding participants",
        })
    }
}

// Remove participant from group
exports.removeParticipant = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId, participantId } = req.params

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is admin or removing themselves
        if (conversation.groupAdmin.toString() !== userId && userId !== participantId) {
            return res.status(403).json({
                success: false,
                message: "Only group admin can remove other participants",
            })
        }

        // Check if participant is in the group
        if (!conversation.participants.includes(new mongoose.Types.ObjectId(participantId))) {
            return res.status(400).json({
                success: false,
                message: "Participant is not in the group",
            });
        }


        // If admin is leaving, assign a new admin if there are other participants
        if (participantId === conversation.groupAdmin.toString()) {
            const remainingParticipants = conversation.participants.filter((p) => p.toString() !== participantId)

            if (remainingParticipants.length > 0) {
                conversation.groupAdmin = remainingParticipants[0]
            }
        }

        // Remove participant
        conversation.participants = conversation.participants.filter((p) => p.toString() !== participantId)

        // Remove from unreadCounts
        conversation.unreadCounts = conversation.unreadCounts.filter((uc) => uc.user.toString() !== participantId)

        // If no participants left, delete the conversation
        if (conversation.participants.length === 0) {
            await Conversation.findByIdAndDelete(conversationId)
            return res.status(200).json({
                success: true,
                message: "Group deleted as no participants remain",
            })
        }

        await conversation.save()

        // Populate the participants
        await conversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            conversation,
        })
    } catch (error) {
        console.error("Remove participant error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while removing participant",
        })
    }
}

// Leave group
exports.leaveGroup = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is in the group
        if (!conversation.participants.includes(mongoose.Types.ObjectId(userId))) {
            return res.status(400).json({
                success: false,
                message: "You are not in this group",
            })
        }

        // If admin is leaving, assign a new admin if there are other participants
        if (userId === conversation.groupAdmin.toString()) {
            const remainingParticipants = conversation.participants.filter((p) => p.toString() !== userId)

            if (remainingParticipants.length > 0) {
                conversation.groupAdmin = remainingParticipants[0]
            }
        }

        // Remove user from participants
        conversation.participants = conversation.participants.filter((p) => p.toString() !== userId)

        // Remove from unreadCounts
        conversation.unreadCounts = conversation.unreadCounts.filter((uc) => uc.user.toString() !== userId)

        // If no participants left, delete the conversation
        if (conversation.participants.length === 0) {
            await Conversation.findByIdAndDelete(conversationId)
            return res.status(200).json({
                success: true,
                message: "Group deleted as no participants remain",
            })
        }

        await conversation.save()

        res.status(200).json({
            success: true,
            message: "You have left the group",
        })
    } catch (error) {
        console.error("Leave group error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while leaving group",
        })
    }
}

// Add a new function to change group admin
exports.changeGroupAdmin = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params
        const { newAdminId } = req.body

        // Validate input
        if (!newAdminId) {
            return res.status(400).json({
                success: false,
                message: "New admin ID is required",
            })
        }

        // Find the conversation
        const conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            })
        }

        // Check if it's a group
        if (!conversation.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This is not a group conversation",
            })
        }

        // Check if user is current admin
        if (conversation.groupAdmin.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the current group admin can transfer admin rights",
            })
        }

        // Check if new admin is in the group
        if (!conversation.participants.some((p) => p.toString() === newAdminId)) {
            return res.status(400).json({
                success: false,
                message: "New admin must be a participant in the group",
            })
        }

        // Update group admin
        conversation.groupAdmin = newAdminId
        await conversation.save()

        // Populate the participants
        await conversation.populate("participants", "_id name phoneNumber profilePicture")

        res.status(200).json({
            success: true,
            message: "Group admin changed successfully",
            conversation,
        })
    } catch (error) {
        console.error("Change group admin error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while changing group admin",
        })
    }
}
