import crypto from "crypto";
import axios from "axios";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Verify webhook for Meta
export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification request:", { mode, token, challenge });
  console.log("Expected token:", VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    res.sendStatus(403);
  }
}

// Process incoming WhatsApp messages
export async function handleIncomingMessage(req, res) {
  try {
    console.log("📨 Webhook received at:", new Date().toISOString());
    console.log("📨 Request headers:", req.headers);
    console.log("📨 Request body:", JSON.stringify(req.body, null, 2));
    
    // Always respond with 200 to acknowledge receipt
    res.sendStatus(200);

    const body = req.body;
    
    // Check if it's a WhatsApp message
    if (
      body.object === "whatsapp_business_account" &&
      body.entry?.[0]?.changes?.[0]?.value?.messages
    ) {
      const messages = body.entry[0].changes[0].value.messages;
      const contact = body.entry[0].changes[0].value.contacts?.[0];
      const customerNumber = contact?.wa_id;
      const customerName = contact?.profile?.name;
      const message = messages[0];
      
      console.log(`✅ Found message from ${customerName} (${customerNumber})`);
      console.log(`📝 Message type: ${message.type}`);
      
      if (message.type === "text") {
        const text = message.text.body;
        console.log(`💬 Message content: "${text}"`);
        
        // Process message with your ledger system
        await processWhatsAppMessage(customerNumber, customerName, text);
      } else {
        console.log(`📎 Unhandled message type: ${message.type}`);
      }
    } else {
      console.log("⚠️ No messages found in webhook payload");
      console.log("Webhook structure:", {
        hasObject: !!body.object,
        objectValue: body.object,
        hasEntry: !!body.entry,
        entryLength: body.entry?.length,
        hasChanges: !!body.entry?.[0]?.changes,
        hasMessages: !!body.entry?.[0]?.changes?.[0]?.value?.messages
      });
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Send message to WhatsApp
export async function sendWhatsAppMessage(to, message) {
  try {
    console.log(`📤 Attempting to send message to ${to}`);
    console.log(`📤 Message: ${message}`);
    
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    console.log(`✅ Message sent successfully to ${to}`);
    console.log(`✅ Response:`, response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Message:", error.message);
    throw error;
  }
}

// Process message with your ledger system
async function processWhatsAppMessage(phoneNumber, customerName, text) {
  try {
    console.log(`🔄 Processing message from ${customerName} (${phoneNumber})`);
    console.log(`🔄 Message text: "${text}"`);
    
    // Call your existing ledger endpoint
    const response = await axios.post("http://localhost:5000/message", {
      message: text,
      customerPhone: phoneNumber,
      customerName: customerName,
    });
    
    console.log(`📊 Ledger response:`, response.data);
    
    if (response.data.success) {
      console.log(`✅ Sending success response to ${phoneNumber}`);
      await sendWhatsAppMessage(phoneNumber, response.data.message);
    } else {
      console.log(`❌ Sending error response to ${phoneNumber}`);
      await sendWhatsAppMessage(phoneNumber, `❌ Error: ${response.data.message}`);
    }
  } catch (error) {
    console.error("❌ Error processing with ledger:", error.message);
    if (error.response) {
      console.error("Ledger response error:", error.response.data);
    }
    await sendWhatsAppMessage(phoneNumber, "❌ Server error. Please try again later.");
  }
}