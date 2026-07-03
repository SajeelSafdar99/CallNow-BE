const express = require("express")
const { syncData } = require("../controllers/sync")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// GET /api/sync?lastSyncAt=<ISO_DATE>
// Returns new conversations + messages since the given timestamp
router.get("/", authenticate, syncData)

module.exports = router

