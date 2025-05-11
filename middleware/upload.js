const multer = require("multer")
const path = require("path")
const fs = require("fs")

// Ensure upload directories exist
const createDirIfNotExists = (dirPath) => {
    const fullPath = path.join(__dirname, "..", "public", dirPath)
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true })
    }
}

createDirIfNotExists("/uploads/profile")
createDirIfNotExists("/uploads/media")
createDirIfNotExists("/uploads/groups")

// Configure storage for profile pictures
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "..", "public", "uploads", "profile"))
    },
    filename: (req, file, cb) => {
        const userId = req.userId
        const fileExt = path.extname(file.originalname)
        const fileName = `${userId}-${Date.now()}${fileExt}`
        cb(null, fileName)
    },
})

// Configure storage for group images
const groupStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "..", "public", "uploads", "groups"))
    },
    filename: (req, file, cb) => {
        const conversationId = req.params.conversationId
        const fileExt = path.extname(file.originalname)
        const fileName = `group-${conversationId}-${Date.now()}${fileExt}`
        cb(null, fileName)
    },
})

// Configure storage for media files (images, videos, etc.) with user-specific folders
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create user-specific directory
        const userId = req.userId
        let mediaType = "documents"

        // Determine media type based on mimetype
        if (file.mimetype.startsWith('image/')) {
            mediaType = "images"
        } else if (file.mimetype.startsWith('video/')) {
            mediaType = "videos"
        } else if (file.mimetype.startsWith('audio/')) {
            mediaType = "audio"
        }

        const userMediaPath = path.join(__dirname, "..", "public", "uploads", "media", userId, mediaType)

        // Create directory if it doesn't exist
        if (!fs.existsSync(userMediaPath)) {
            fs.mkdirSync(userMediaPath, { recursive: true })
        }

        cb(null, userMediaPath)
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname)
        const fileName = `${Date.now()}${fileExt}`
        cb(null, fileName)
    },
})

// File filter to allow only images for profile pictures and group images
const imageFileFilter = (req, file, cb) => {
    const allowedFileTypes = /jpeg|jpg|png|gif/
    const extname = allowedFileTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedFileTypes.test(file.mimetype)

    if (extname && mimetype) {
        return cb(null, true)
    } else {
        cb(new Error("Only image files are allowed for profile pictures"))
    }
}

// Create multer instances
const profileUpload = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: imageFileFilter,
})

const groupUpload = multer({
    storage: groupStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: imageFileFilter,
})

const mediaUpload = multer({
    storage: mediaStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
})

// Export the configured multer instances
module.exports = {
    single: profileUpload.single.bind(profileUpload),
    group: groupUpload.single.bind(groupUpload),
    media: mediaUpload,
    getMediaPath: (userId, mediaType, fileName) => {
        return `/uploads/media/${userId}/${mediaType}/${fileName}`;
    }
}