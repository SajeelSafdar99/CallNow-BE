const Message = require("../models/message")
const Conversation = require("../models/conversation")
const mongoose = require("mongoose")
const path = require("path")
const upload = require("../middleware/upload")

// Send message
exports.sendMessage = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId, content, contentType = "text", replyTo } = req.body

        // Validate input
        if (!conversationId || (!content && !req.file && !req.files)) {
            return res.status(400).json({
                success: false,
                message: "Conversation ID and either content or media are required",
            })
        }

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        // Create message data
        const messageData = {
            conversationId,
            sender: userId,
            content: content || "",
            contentType: contentType,
        }

        // Add reply reference if provided
        if (replyTo) {
            const replyMessage = await Message.findById(replyTo)
            if (replyMessage && replyMessage.conversationId.toString() === conversationId) {
                messageData.replyTo = replyTo
            }
        }

        // Handle multiple files
        if (req.files && req.files.length > 0) {
            const messages = [];

            // Process each file and create a message for each
            for (const file of req.files) {
                // Determine media type based on mimetype
                let mediaType = "documents";
                let fileContentType = "document";

                if (file.mimetype.startsWith('image/')) {
                    fileContentType = "image";
                    mediaType = "images";
                } else if (file.mimetype.startsWith('video/')) {
                    fileContentType = "video";
                    mediaType = "videos";
                } else if (file.mimetype.startsWith('audio/')) {
                    fileContentType = "audio";
                    mediaType = "audio";
                }

                // Get the relative path from the public directory
                const relativePath = file.path.split('public')[1];

                // Create message data for this file
                const fileMessageData = {
                    ...messageData,
                    contentType: fileContentType,
                    mediaUrl: relativePath,
                    mediaSize: file.size,
                    mediaName: file.originalname,
                };

                // Set content based on file type if not provided
                if (!content) {
                    if (fileContentType === "image") {
                        fileMessageData.content = "Image";
                    } else if (fileContentType === "video") {
                        fileMessageData.content = "Video";
                    } else if (fileContentType === "audio") {
                        fileMessageData.content = "Audio Message";
                    } else {
                        fileMessageData.content = file.originalname || "Document";
                    }
                }

                // Only add reply to the first message
                if (messages.length > 0) {
                    delete fileMessageData.replyTo;
                }

                // Create and save the message
                const newMessage = new Message(fileMessageData);
                await newMessage.save();

                // Populate sender info
                await newMessage.populate("sender", "_id name phoneNumber profilePicture");

                // Populate reply info if exists
                if (newMessage.replyTo) {
                    await newMessage.populate({
                        path: "replyTo",
                        select: "content contentType sender",
                        populate: {
                            path: "sender",
                            select: "_id name",
                        },
                    });
                }

                messages.push(newMessage);
            }

            // Update conversation with last message
            conversation.lastMessage = messages[messages.length - 1]._id;

            // Update unread counts for all participants except sender
            conversation.unreadCounts.forEach((uc) => {
                if (uc.user.toString() !== userId) {
                    uc.count += messages.length;
                }
            });

            await conversation.save();

            return res.status(201).json({
                success: true,
                messages: messages,
            });
        }

        // Handle single file
        if (req.file) {
            // Determine media type based on mimetype
            let mediaType = "documents"
            if (req.file.mimetype.startsWith('image/')) {
                messageData.contentType = "image"
                mediaType = "images"
            } else if (req.file.mimetype.startsWith('video/')) {
                messageData.contentType = "video"
                mediaType = "videos"
            } else if (req.file.mimetype.startsWith('audio/')) {
                messageData.contentType = "audio"
                mediaType = "audio"
            } else {
                messageData.contentType = "document"
            }

            // Get the relative path from the public directory
            const relativePath = req.file.path.split('public')[1]
            messageData.mediaUrl = relativePath
            messageData.mediaSize = req.file.size
            messageData.mediaName = req.file.originalname

            // Set default content if not provided
            if (!content) {
                if (messageData.contentType === "image") {
                    messageData.content = "Image"
                } else if (messageData.contentType === "video") {
                    messageData.content = "Video"
                } else if (messageData.contentType === "audio") {
                    messageData.content = "Audio Message"
                } else {
                    messageData.content = req.file.originalname || "Document"
                }
            }
        }

        // Create new message
        const newMessage = new Message(messageData)
        await newMessage.save()

        // Update conversation with last message
        conversation.lastMessage = newMessage._id

        // Update unread counts for all participants except sender
        conversation.unreadCounts.forEach((uc) => {
            if (uc.user.toString() !== userId) {
                uc.count += 1
            }
        })

        await conversation.save()

        // Populate sender info
        await newMessage.populate("sender", "_id name phoneNumber profilePicture")

        // Populate reply info if exists
        if (newMessage.replyTo) {
            await newMessage.populate({
                path: "replyTo",
                select: "content contentType sender",
                populate: {
                    path: "sender",
                    select: "_id name",
                },
            })
        }

        res.status(201).json({
            success: true,
            message: newMessage,
        })
    } catch (error) {
        console.error("Send message error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while sending message",
            error: error.message
        })
    }
}

// Get messages for a conversation
exports.getMessages = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params
        const { page = 1, limit = 50 } = req.query

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        // Calculate skip value for pagination
        const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

        // Get messages
        const messages = await Message.find({
            conversationId,
            isDeleted: false,
            deletedFor: { $ne: userId }, // Not deleted for this user
        })
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(Number.parseInt(limit))
            .populate("sender", "_id name phoneNumber profilePicture")
            .populate({
                path: "replyTo",
                select: "content contentType sender",
                populate: {
                    path: "sender",
                    select: "_id name",
                },
            })

        // Mark messages as read by this user
        await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId }, // Not sent by this user
                "readBy.user": { $ne: userId }, // Not already read by this user
            },
            {
                $push: {
                    readBy: {
                        user: userId,
                        readAt: new Date(),
                    },
                },
            },
        )

        // Reset unread count for this user
        await Conversation.updateOne(
            { _id: conversationId, "unreadCounts.user": userId },
            { $set: { "unreadCounts.$.count": 0 } },
        )

        res.status(200).json({
            success: true,
            messages: messages.reverse(), // Return in chronological order
            page: Number.parseInt(page),
            limit: Number.parseInt(limit),
        })
    } catch (error) {
        console.error("Get messages error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching messages",
        })
    }
}

// Delete message
exports.deleteMessage = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { messageId } = req.params
        const { deleteForEveryone } = req.body

        // Find the message
        const message = await Message.findById(messageId)
        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            })
        }

        // Check if user is the sender or in the conversation
        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to delete this message",
            })
        }

        // If delete for everyone and user is sender
        if (deleteForEveryone && message.sender.toString() === userId) {
            message.isDeleted = true
            await message.save()

            // If this was the last message, update conversation.lastMessage
            if (conversation.lastMessage && conversation.lastMessage.toString() === messageId) {
                const previousMessage = await Message.findOne({
                    conversationId: conversation._id,
                    _id: { $ne: messageId },
                    isDeleted: false,
                }).sort({ createdAt: -1 })

                conversation.lastMessage = previousMessage ? previousMessage._id : null
                await conversation.save()
            }

            return res.status(200).json({
                success: true,
                message: "Message deleted for everyone",
            })
        }

        // Delete for current user only
        const userObjectId = new mongoose.Types.ObjectId(userId)
        if (message.deletedFor.includes(userObjectId)) {
            return res.status(400).json({
                success: false,
                message: "Message already deleted for you",
            })
        }

        message.deletedFor.push(userId)
        await message.save()

        res.status(200).json({
            success: true,
            message: "Message deleted for you",
        })
    } catch (error) {
        console.error("Delete message error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while deleting message",
        })
    }
}

// Mark messages as delivered
exports.markAsDelivered = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { conversationId } = req.params

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId,
        })

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found or you are not a participant",
            })
        }

        // Mark messages as delivered
        await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId }, // Not sent by this user
                "deliveredTo.user": { $ne: userId }, // Not already delivered to this user
            },
            {
                $push: {
                    deliveredTo: {
                        user: userId,
                        deliveredAt: new Date(),
                    },
                },
            },
        )

        res.status(200).json({
            success: true,
            message: "Messages marked as delivered",
        })
    } catch (error) {
        console.error("Mark as delivered error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while marking messages as delivered",
        })
    }
}