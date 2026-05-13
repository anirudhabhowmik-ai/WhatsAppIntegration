import axios from "axios";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_URL =
  process.env.API_URL || "https://whatsappintegration-tk0f.onrender.com";

export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification:", { mode, token });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Verification failed");
    res.sendStatus(403);
  }
}

export async function handleIncomingMessage(req, res) {
  try {
    // Always respond with 200 first
    res.sendStatus(200);

    console.log("=".repeat(60));
    console.log("📨 WEBHOOK RECEIVED");
    console.log("Time:", new Date().toISOString());
    console.log("RAW BODY:", JSON.stringify(req.body, null, 2));
    console.log("=".repeat(60));

    const body = req.body;

    // Extract the message from the webhook
    const entry = body.entry?.[0];
    if (!entry) {
      console.log("No entry in webhook");
      return;
    }

    const changes = entry.changes?.[0];
    if (!changes) {
      console.log("No changes in webhook");
      return;
    }

    const value = changes.value;

    // Check if this contains a message
    if (value.messages && value.messages.length > 0) {
      const message = value.messages[0];

      // Only process text messages
      if (message.type !== "text" || !message.text?.body) {
        console.log("⚠️ Skipping non-text message:", message.type);
        return;
      }

      const contact = value.contacts?.[0];
      const customerNumber = message.from;
      const customerName = contact?.profile?.name || "Customer";
      const messageText = message.text.body; // now guaranteed to exist

      console.log(`✅ TEXT MESSAGE FOUND!`);
      console.log(`📱 Customer: ${customerName} (${customerNumber})`);
      console.log(`💬 Message: "${messageText}"`);

      // Process the message
      await processMessage(customerNumber, customerName, messageText);
    } else if (value.statuses) {
      console.log(`ℹ️ Status update: ${value.statuses[0]?.status}`);
    } else {
      console.log("ℹ️ Other webhook type:", Object.keys(value));
    }
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    console.error(error.stack);
  }
}

async function processMessage(phoneNumber, customerName, messageText) {
  try {
    console.log(`🔄 Calling /message endpoint at ${API_URL}/message`);
    console.log(`📤 Payload:`, {
      message: messageText,
      customerPhone: phoneNumber,
      customerName: customerName,
      shopkeeperId: "default",
    });

    const response = await axios.post(
      `${API_URL}/message`,
      {
        message: messageText,
        customerPhone: phoneNumber,
        customerName: customerName,
        shopkeeperId: "default",
      },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response data:`, response.data);

    if (response.data.success) {
      console.log(`✅ Sending reply to ${phoneNumber}`);
      await sendWhatsAppMessage(phoneNumber, response.data.message);
    } else {
      console.log(`❌ Error from message endpoint: ${response.data.message}`);
      await sendWhatsAppMessage(phoneNumber, `❌ ${response.data.message}`);
    }
  } catch (error) {
    console.error("❌ Error calling /message endpoint:");
    console.error("Message:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    await sendWhatsAppMessage(
      phoneNumber,
      "❌ Server error. Please try again.",
    );
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    console.log(`📤 Sending to WhatsApp API...`);
    console.log(`📤 To: ${to}`);
    console.log(`📤 Message: ${message.substring(0, 100)}`);

    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(`✅ Message sent successfully to ${to}`);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to send WhatsApp message:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}
