const User = require("../models/user")
const OTP = require("../models/otp")
const { generateOTP, sendOTP } = require("../utils/twilio")
const { generateToken } = require("../utils/jwt")

// 1. Register API
exports.register = async (req, res) => {
    try {
        const { phoneNumber, password, name } = req.body
        // Validate input
        if (!phoneNumber || !password) {
            return res.status(400).json({
                success: false,
                message: "Phone number and password are required",
            })
        }

        // Check if user already exists
        const existingUser = await User.findOne({ phoneNumber })
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this phone number already exists",
            })
        }

        // Check if this is the first user (to make them admin)
        const userCount = await User.countDocuments()
        const isFirstUser = userCount === 0

        const newUser = new User({
            phoneNumber,
            password,
            name: name || "",
            isVerified: false,
            isAdmin: isFirstUser, // First user becomes admin
        })

        await newUser.save()

        // Generate and save OTP
        const otp = generateOTP()
        const newOTP = new OTP({
            phoneNumber,
            otp,
            purpose: "registration",
        })

        await newOTP.save()

        // Send OTP via WhatsApp/SMS
        const otpResult = await sendOTP(phoneNumber, otp)

        res.status(201).json({
            success: true,
            message: `Registration initiated. OTP sent via ${otpResult.method || "message"}. Please verify your phone number.`,
            userId: newUser._id,
            isAdmin: isFirstUser,
        })
    } catch (error) {
        console.error("Registration error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during registration",
        })
    }
}

// 2. Verify OTP API
exports.verifyOTP = async (req, res) => {
    try {
        const { phoneNumber, otp, purpose = "registration" } = req.body

        // Validate input
        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone number and OTP are required",
            })
        }

        // Find the OTP record
        const otpRecord = await OTP.findOne({
            phoneNumber,
            purpose,
        })

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "OTP not found or expired. Please request a new OTP.",
            })
        }

        // Verify OTP
        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please try again.",
            })
        }

        // If OTP is for registration, mark user as verified
        if (purpose === "registration") {
            await User.findOneAndUpdate({ phoneNumber }, { isVerified: true })
        }

        // Delete the used OTP
        await OTP.deleteOne({ _id: otpRecord._id })

        // For registration, return success
        if (purpose === "registration") {
            const user = await User.findOne({ phoneNumber })
            const token = generateToken(user._id)

            return res.status(200).json({
                success: true,
                message: "Phone number verified successfully",
                token,
                user: {
                    id: user._id,
                    phoneNumber: user.phoneNumber,
                    name: user.name,
                    profilePicture: user.profilePicture,
                    isVerified: user.isVerified,
                    isAdmin: user.isAdmin,
                },
            })
        }

        // For password reset, return success but no token yet
        if (purpose === "password_reset") {
            return res.status(200).json({
                success: true,
                message: "OTP verified successfully. You can now reset your password.",
                phoneNumber,
            })
        }

        res.status(200).json({
            success: true,
            message: "OTP verified successfully",
        })
    } catch (error) {
        console.error("OTP verification error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during OTP verification",
        })
    }
}

// 3. Resend OTP API
exports.resendOTP = async (req, res) => {
    try {
        const { phoneNumber, purpose = "registration" } = req.body

        // Validate input
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            })
        }

        // Check if user exists for the given purpose
        if (purpose === "registration") {
            const user = await User.findOne({ phoneNumber, isVerified: false })
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "User not found or already verified",
                })
            }
        } else if (purpose === "password_reset") {
            const user = await User.findOne({ phoneNumber })
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "User not found",
                })
            }
        }

        // Delete any existing OTP
        await OTP.deleteMany({ phoneNumber, purpose })

        // Generate and save new OTP
        const otp = generateOTP()
        const newOTP = new OTP({
            phoneNumber,
            otp,
            purpose,
        })

        await newOTP.save()

        // Send OTP via WhatsApp/SMS
        const otpResult = await sendOTP(phoneNumber, otp)

        res.status(200).json({
            success: true,
            message: `OTP resent via ${otpResult.method || "message"}. Please check your phone.`,
        })
    } catch (error) {
        console.error("Resend OTP error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during OTP resend",
        })
    }
}

// 4. Login API
exports.login = async (req, res) => {
    try {
        const { phoneNumber, password, deviceId, deviceName } = req.body

        // Validate input
        if (!phoneNumber || !password) {
            return res.status(400).json({
                success: false,
                message: "Phone number and password are required",
            })
        }

        // Find user
        const user = await User.findOne({ phoneNumber })
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid phone number or password",
            })
        }

        // Check if user is verified
        if (!user.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Account not verified. Please verify your phone number first.",
                status: "unverified",
            })
        }

        // Check if user is suspended
        if (user.isSuspended) {
            // Check if suspension has expired
            if (user.suspensionDetails?.expiresAt && new Date() > new Date(user.suspensionDetails.expiresAt)) {
                // Auto-unsuspend if expired
                user.isSuspended = false
                user.suspensionDetails = undefined
                await user.save()
            } else {
                const suspensionMessage = user.suspensionDetails?.reason
                    ? `Account suspended: ${user.suspensionDetails.reason}`
                    : "Your account has been suspended. Please contact support."

                return res.status(403).json({
                    success: false,
                    message: suspensionMessage,
                    status: "suspended",
                    suspendedAt: user.suspensionDetails?.suspendedAt,
                    expiresAt: user.suspensionDetails?.expiresAt,
                })
            }
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password)
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid phone number or password",
            })
        }

        // Update device information if provided
        if (deviceId && deviceName) {
            // Check if device already exists
            const deviceExists = user.devices.some((device) => device.deviceId === deviceId)

            if (!deviceExists) {
                // Add new device
                user.devices.push({
                    deviceId,
                    deviceName,
                    lastActive: new Date(),
                })
            } else {
                // Update existing device
                user.devices = user.devices.map((device) => {
                    if (device.deviceId === deviceId) {
                        return {
                            ...device,
                            deviceName,
                            lastActive: new Date(),
                        }
                    }
                    return device
                })
            }

            // If no active device is set, set this one as active
            if (!user.activeDevice) {
                user.activeDevice = deviceId
            }

            await user.save()
        }

        // Generate JWT token
        const token = generateToken(user._id)

        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                profilePicture: user.profilePicture,
                about: user.about,
                activeDevice: user.activeDevice,
                devices: user.devices,
                isAdmin: user.isAdmin,
            },
        })
    } catch (error) {
        console.error("Login error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during login",
        })
    }
}

// 5. Forget Password API
exports.forgetPassword = async (req, res) => {
    try {
        const { phoneNumber } = req.body

        // Validate input
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            })
        }

        // Check if user exists
        const user = await User.findOne({ phoneNumber })
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User with this phone number does not exist",
            })
        }

        // Delete any existing OTP
        await OTP.deleteMany({ phoneNumber, purpose: "password_reset" })

        // Generate and save new OTP
        const otp = generateOTP()
        const newOTP = new OTP({
            phoneNumber,
            otp,
            purpose: "password_reset",
        })

        await newOTP.save()

        // Send OTP via WhatsApp/SMS
        const otpResult = await sendOTP(phoneNumber, otp)

        res.status(200).json({
            success: true,
            message: `Password reset OTP sent via ${otpResult.method || "message"}. Please check your phone.`,
        })
    } catch (error) {
        console.error("Forget password error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during password reset request",
        })
    }
}

// 6. Reset Password After OTP Verification
exports.resetPassword = async (req, res) => {
    try {
        const { phoneNumber, otp, newPassword } = req.body

        // Validate input
        if (!phoneNumber || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Phone number, OTP, and new password are required",
            })
        }

        // Find the OTP record
        const otpRecord = await OTP.findOne({
            phoneNumber,
            purpose: "password_reset",
        })

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "OTP not found or expired. Please request a new OTP.",
            })
        }

        // Verify OTP
        if (otpRecord.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please try again.",
            })
        }

        // Find user
        const user = await User.findOne({ phoneNumber })
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found",
            })
        }

        // Update password
        user.password = newPassword
        await user.save()

        // Delete the used OTP
        await OTP.deleteOne({ _id: otpRecord._id })

        res.status(200).json({
            success: true,
            message: "Password reset successful. You can now login with your new password.",
        })
    } catch (error) {
        console.error("Reset password error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during password reset",
        })
    }
}

// 7. Change Password After Login
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body
        const userId = req.userId // From auth middleware

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required",
            })
        }

        // Find user
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Verify current password
        const isPasswordValid = await user.comparePassword(currentPassword)
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect",
            })
        }

        // Update password
        user.password = newPassword
        await user.save()

        res.status(200).json({
            success: true,
            message: "Password changed successfully",
        })
    } catch (error) {
        console.error("Change password error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during password change",
        })
    }
}
