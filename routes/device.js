const express = require("express")
const deviceController = require("../controllers/device")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.get("/", authenticate, deviceController.getDevices)
router.put("/active/:deviceId", authenticate, deviceController.setActiveDevice)
router.delete("/:deviceId", authenticate, deviceController.removeDevice)
router.put("/:deviceId/name", authenticate, deviceController.updateDeviceName)
router.put("/:deviceId/activity", authenticate, deviceController.updateDeviceActivity)

module.exports = router
