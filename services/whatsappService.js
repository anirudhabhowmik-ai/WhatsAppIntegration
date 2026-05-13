import axios from "axios";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_URL = process.env.API_URL || "https://whatsappintegration-tk0f.onrender.com";

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
    
    const body = req.body;
    console.log("📨 Webhook received at:", new Date().toISOString());
    
    // Check if this webhook contains messages
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
    
    // IMPORTANT: Check if this webhook has MESSAGES (not statuses)
    if (value.messages && value.messages.length > 0) {
      console.log("✅ This webhook contains actual messages!");
      
      const message = value.messages[0];
      const contact = value.contacts?.[0];
      
      const customerNumber = message.from;
      const customerName = contact?.profile?.name || "Customer";
      const messageText = message.text?.body;
      const messageType = message.type;
      
      console.log(`📱 From: ${customerNumber} (${customerName})`);
      console.log(`📝 Type: ${messageType}`);
      console.log(`💬 Message: "${messageText}"`);
      
      if (messageType === "text" && messageText) {
        await processMessage(customerNumber, customerName, messageText);
      } else {
        console.log(`⚠️ Unhandled message type: ${messageType}`);
      }
    } else if (value.statuses) {
      // This is just a status update (delivered, read, sent) - ignore
      console.log(`ℹ️ Status update: ${value.statuses[0]?.status} for message ${value.statuses[0]?.id}`);
    } else {
      console.log("ℹ️ Other webhook type:", Object.keys(value));
    }
    
  } catch (error) {
    console.error("❌ Error in webhook handler:", error.message);
    console.error("Stack:", error.stack);
  }
}

async function processMessage(phoneNumber, customerName, text) {
  try {
    console.log(`🔄 Sending to message endpoint: ${API_URL}/message`);
    console.log(`📤 Payload:`, { message: text, customerPhone: phoneNumber, customerName });
    
    const response = await axios.post(`${API_URL}/message`, {
      message: text,
      customerPhone: phoneNumber,
      customerName: customerName,
      shopkeeperId: "default"
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response data:`, response.data);
    
    if (response.data.success) {
      console.log(`✅ Sending success reply`);
      await sendWhatsAppMessage(phoneNumber, response.data.message);
    } else {
      console.log(`❌ Error from message endpoint: ${response.data.message}`);
      await sendWhatsAppMessage(phoneNumber, `❌ ${response.data.message}`);
    }
  } catch (error) {
    console.error("❌ Error calling message endpoint:");
    console.error("Message:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    await sendWhatsAppMessage(phoneNumber, "❌ Server error. Please try again.");
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    console.log(`📤 Sending WhatsApp message to ${to}`);
    
    const response = await axios.post(url, {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message },
    }, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    
    console.log(`✅ WhatsApp message sent successfully`);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
    throw error;
  }
}