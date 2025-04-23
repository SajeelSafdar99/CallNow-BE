const twilio = require("twilio");
const dotenv = require("dotenv");

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const client = twilio(accountSid, authToken);

// Generate a random 6-digit OTP
exports.generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via WhatsApp, fallback to SMS if WhatsApp fails
exports.sendOTP = async (phoneNumber, otp) => {
    try {
        await client.messages.create({
            body: `Your CallNow verification code is: ${otp}. This code expires in 10 minutes.`,
            from: `whatsapp:${twilioWhatsAppNumber}`,
            to: `whatsapp:${phoneNumber}`,
        });

        return { success: true, method: "whatsapp" };
    } catch (whatsappError) {
        console.error("WhatsApp message failed:", whatsappError);
        try {
            await client.messages.create({
                body: `Your CallNow verification code is: ${otp}. This code expires in 10 minutes.`,
                from: twilioPhoneNumber,
                to: phoneNumber,
            });

            return { success: true, method: "sms" };
        } catch (smsError) {
            console.error("SMS message failed:", smsError);
            return { success: false, error: smsError.message };
        }
    }
};
