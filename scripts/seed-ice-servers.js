/**
 * Seed Script: Populate default ICE servers
 *
 * Usage:
 *   node scripts/seed-ice-servers.js
 *
 * This script inserts a set of well-known free STUN servers into the
 * IceServer collection so that the admin-panel-managed ICE server list
 * is populated out of the box.  Existing documents with the same URL
 * are skipped (upsert by primary URL) to keep the script idempotent.
 */

require("dotenv").config()
const mongoose = require("mongoose")
const connectDB = require("../config/db")
const IceServer = require("../models/ice-server")

const DEFAULT_ICE_SERVERS = [
    // ── Google STUN servers (reliable, globally distributed) ────────────────
    {
        urls: ["stun:stun.l.google.com:19302"],
        serverType: "stun",
        provider: "Google",
        region: "global",
        priority: 10,
        isActive: true,
    },
    {
        urls: ["stun:stun1.l.google.com:19302"],
        serverType: "stun",
        provider: "Google",
        region: "global",
        priority: 9,
        isActive: true,
    },
    {
        urls: ["stun:stun2.l.google.com:19302"],
        serverType: "stun",
        provider: "Google",
        region: "global",
        priority: 8,
        isActive: true,
    },
    {
        urls: ["stun:stun3.l.google.com:19302"],
        serverType: "stun",
        provider: "Google",
        region: "global",
        priority: 7,
        isActive: true,
    },
    {
        urls: ["stun:stun4.l.google.com:19302"],
        serverType: "stun",
        provider: "Google",
        region: "global",
        priority: 6,
        isActive: true,
    },

    // ── Cloudflare STUN server ───────────────────────────────────────────────
    {
        urls: ["stun:stun.cloudflare.com:3478"],
        serverType: "stun",
        provider: "Cloudflare",
        region: "global",
        priority: 10,
        isActive: true,
    },

    // ── Twilio STUN servers ──────────────────────────────────────────────────
    {
        urls: ["stun:global.stun.twilio.com:3478"],
        serverType: "stun",
        provider: "Twilio",
        region: "global",
        priority: 9,
        isActive: true,
    },

    // ── Open Relay TURN server (free tier, replace credentials if using paid) ─
    // Uncomment and fill in your credentials to enable a TURN server.
    // {
    //     urls: [
    //         "turn:openrelay.metered.ca:80",
    //         "turn:openrelay.metered.ca:443",
    //         "turn:openrelay.metered.ca:443?transport=tcp",
    //     ],
    //     username: "openrelayproject",
    //     credential: "openrelayproject",
    //     serverType: "turn",
    //     provider: "OpenRelay",
    //     region: "global",
    //     priority: 5,
    //     isActive: false, // set to true once you have valid credentials
    // },
]

const seed = async () => {
    await connectDB()

    console.log(`\nSeeding ${DEFAULT_ICE_SERVERS.length} default ICE server(s)...\n`)

    let inserted = 0
    let skipped = 0

    for (const serverData of DEFAULT_ICE_SERVERS) {
        // Use the first URL as the unique key to avoid duplicates
        const primaryUrl = serverData.urls[0]

        const existing = await IceServer.findOne({ urls: primaryUrl })
        if (existing) {
            console.log(`  SKIP  (already exists): ${primaryUrl}`)
            skipped++
        } else {
            await IceServer.create(serverData)
            console.log(`  INSERT: ${primaryUrl}  [${serverData.serverType}] priority=${serverData.priority}`)
            inserted++
        }
    }

    console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}\n`)
    await mongoose.disconnect()
    process.exit(0)
}

seed().catch((err) => {
    console.error("Seed error:", err)
    process.exit(1)
})

