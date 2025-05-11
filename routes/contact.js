const express = require("express")
const contactController = require("../controllers/contact")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.get("/check/:phoneNumber", authenticate, contactController.checkUserExists)
router.post("/", authenticate, contactController.addContact)
router.get("/", authenticate, contactController.getContacts)
router.get("/groups", authenticate, contactController.getContactGroups)
router.get("/:contactId", authenticate, contactController.getContactById)
router.put("/:contactId", authenticate, contactController.updateContact)
router.delete("/:contactId", authenticate, contactController.deleteContact)
router.post("/import", authenticate, contactController.importContacts)

module.exports = router
