const Contact = require("../models/contact")
const User = require("../models/user")

// Check if a user exists by phone number
exports.checkUserExists = async (req, res) => {
    try {
        const { phoneNumber } = req.params

        // Validate input
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            })
        }

        // Check if user exists but don't return sensitive information
        const user = await User.findOne({ phoneNumber }).select("_id name phoneNumber profilePicture about isVerified")

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                exists: false,
            })
        }

        // Check if this user is already in contacts
        const isContact = await Contact.findOne({
            owner: req.userId,
            user: user._id,
        })

        res.status(200).json({
            success: true,
            exists: true,
            isContact: !!isContact,
            user: {
                _id: user._id,
                name: user.name,
                phoneNumber: user.phoneNumber,
                profilePicture: user.profilePicture,
                about: user.about,
            },
        })
    } catch (error) {
        console.error("Check user exists error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while checking user",
        })
    }
}

// Add a contact
exports.addContact = async (req, res) => {
    try {
        const { userId, nickname, isFavorite, contactGroup, notes } = req.body
        const ownerId = req.userId // From auth middleware

        // Validate input
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required",
            })
        }

        // Check if user exists
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if contact already exists
        const existingContact = await Contact.findOne({
            owner: ownerId,
            user: userId,
        })

        if (existingContact) {
            return res.status(400).json({
                success: false,
                message: "This user is already in your contacts",
            })
        }

        // Create new contact
        const newContact = new Contact({
            owner: ownerId,
            user: userId,
            nickname: nickname || "",
            isFavorite: isFavorite || false,
            contactGroup: contactGroup || "",
            notes: notes || "",
        })

        await newContact.save()

        // Populate user details
        await newContact.populate("user", "_id name phoneNumber profilePicture about")

        res.status(201).json({
            success: true,
            message: "Contact added successfully",
            contact: newContact,
        })
    } catch (error) {
        console.error("Add contact error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while adding contact",
        })
    }
}

// Get all contacts for a user
exports.getContacts = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { search, group, favorites } = req.query

        // Build query
        const query = { owner: userId }

        // Add filters if provided
        if (favorites === "true") {
            query.isFavorite = true
        }

        if (group) {
            query.contactGroup = group
        }

        // Get contacts
        let contacts = await Contact.find(query)
            .populate("user", "_id name phoneNumber profilePicture about")
            .sort({ isFavorite: -1, "user.name": 1 })

        // Apply search filter if provided
        if (search) {
            const searchRegex = new RegExp(search, "i")
            contacts = contacts.filter(
                (contact) =>
                    (contact.nickname && searchRegex.test(contact.nickname)) ||
                    (contact.user.name && searchRegex.test(contact.user.name)) ||
                    searchRegex.test(contact.user.phoneNumber),
            )
        }

        res.status(200).json({
            success: true,
            contacts,
        })
    } catch (error) {
        console.error("Get contacts error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching contacts",
        })
    }
}

// Get contact by ID
exports.getContactById = async (req, res) => {
    try {
        const { contactId } = req.params
        const userId = req.userId // From auth middleware

        // Find contact
        const contact = await Contact.findOne({
            _id: contactId,
            owner: userId,
        }).populate("user", "_id name phoneNumber profilePicture about")

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: "Contact not found",
            })
        }

        res.status(200).json({
            success: true,
            contact,
        })
    } catch (error) {
        console.error("Get contact by ID error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching contact",
        })
    }
}

// Update contact
exports.updateContact = async (req, res) => {
    try {
        const { contactId } = req.params
        const userId = req.userId // From auth middleware
        const { nickname, isFavorite, isBlocked, contactGroup, notes } = req.body

        // Find and update contact
        const contact = await Contact.findOne({
            _id: contactId,
            owner: userId,
        })

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: "Contact not found",
            })
        }

        // Update fields if provided
        if (nickname !== undefined) contact.nickname = nickname
        if (isFavorite !== undefined) contact.isFavorite = isFavorite
        if (isBlocked !== undefined) contact.isBlocked = isBlocked
        if (contactGroup !== undefined) contact.contactGroup = contactGroup
        if (notes !== undefined) contact.notes = notes

        await contact.save()

        // Populate user details
        await contact.populate("user", "_id name phoneNumber profilePicture about")

        res.status(200).json({
            success: true,
            message: "Contact updated successfully",
            contact,
        })
    } catch (error) {
        console.error("Update contact error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating contact",
        })
    }
}

// Delete contact
exports.deleteContact = async (req, res) => {
    try {
        const { contactId } = req.params
        const userId = req.userId // From auth middleware

        // Find and delete contact
        const result = await Contact.findOneAndDelete({
            _id: contactId,
            owner: userId,
        })

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Contact not found",
            })
        }

        res.status(200).json({
            success: true,
            message: "Contact deleted successfully",
        })
    } catch (error) {
        console.error("Delete contact error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while deleting contact",
        })
    }
}

// Get contact groups
exports.getContactGroups = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        // Get distinct contact groups
        const groups = await Contact.distinct("contactGroup", {
            owner: userId,
            contactGroup: { $ne: "" }, // Exclude empty groups
        })

        res.status(200).json({
            success: true,
            groups,
        })
    } catch (error) {
        console.error("Get contact groups error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching contact groups",
        })
    }
}

// Import contacts (bulk add)
exports.importContacts = async (req, res) => {
    try {
        const { contacts } = req.body
        const userId = req.userId // From auth middleware

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Valid contacts array is required",
            })
        }

        const results = {
            success: [],
            failed: [],
            duplicates: [],
        }

        // Process each contact
        for (const contact of contacts) {
            try {
                // Check if phone number is provided
                if (!contact.phoneNumber) {
                    results.failed.push({
                        phoneNumber: contact.phoneNumber || "Unknown",
                        reason: "Phone number is required",
                    })
                    continue
                }

                // Check if user exists
                const user = await User.findOne({ phoneNumber: contact.phoneNumber })
                if (!user) {
                    results.failed.push({
                        phoneNumber: contact.phoneNumber,
                        reason: "User not found",
                    })
                    continue
                }

                // Check if contact already exists
                const existingContact = await Contact.findOne({
                    owner: userId,
                    user: user._id,
                })

                if (existingContact) {
                    results.duplicates.push({
                        phoneNumber: contact.phoneNumber,
                        name: user.name,
                    })
                    continue
                }

                // Create new contact
                const newContact = new Contact({
                    owner: userId,
                    user: user._id,
                    nickname: contact.nickname || "",
                    isFavorite: contact.isFavorite || false,
                    contactGroup: contact.contactGroup || "",
                    notes: contact.notes || "",
                })

                await newContact.save()

                results.success.push({
                    phoneNumber: contact.phoneNumber,
                    name: user.name,
                    contactId: newContact._id,
                })
            } catch (error) {
                console.error("Error processing contact:", error)
                results.failed.push({
                    phoneNumber: contact.phoneNumber || "Unknown",
                    reason: "Server error while processing contact",
                })
            }
        }

        res.status(200).json({
            success: true,
            message: "Contacts import completed",
            results,
        })
    } catch (error) {
        console.error("Import contacts error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while importing contacts",
        })
    }
}
