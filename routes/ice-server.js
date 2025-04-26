const express = require("express")
const iceServerController = require("../controllers/ice-server")
const { authenticate } = require("../middleware/auth")
const { isAdmin } = require("../middleware/admin")

const router = express.Router()

// Public route - get active ICE servers
router.get("/", authenticate, iceServerController.getIceServers)

// Admin routes - require admin privileges
router.post("/", authenticate, isAdmin, iceServerController.addIceServer)
router.put("/:id", authenticate, isAdmin, iceServerController.updateIceServer)
router.delete("/:id", authenticate, isAdmin, iceServerController.deleteIceServer)

module.exports = router
