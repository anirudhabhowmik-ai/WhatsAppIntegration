import axios from "axios";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_URL = process.env.API_URL || "https://your-render-app.onrender.com";

export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification:", { mode, token });

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
    res.sendStatus(200);
    
    const body = req.body;
    console.log("📨 Webhook received");
    
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    const contacts = value?.contacts;
    
    if (messages && messages[0]) {
      const message = messages[0];
      const contact = contacts?.[0];
      const customerNumber = message.from;
      const customerName = contact?.profile?.name || "Customer";
      
      if (message.type === "text") {
        const text = message.text.body;
        console.log(`💬 From: ${customerNumber}: ${text}`);
        
        await processMessage(customerNumber, customerName, text);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function processMessage(phoneNumber, customerName, text) {
  try {
    const response = await axios.post(`${API_URL}/message`, {
      message: text,
      customerPhone: phoneNumber,
      customerName: customerName,
      shopkeeperId: "default"
    });
    
    if (response.data.success) {
      await sendWhatsAppMessage(phoneNumber, response.data.message);
    } else {
      await sendWhatsAppMessage(phoneNumber, `❌ ${response.data.message}`);
    }
  } catch (error) {
    console.error("Processing error:", error.message);
    await sendWhatsAppMessage(phoneNumber, "❌ Server error. Try again.");
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    await axios.post(url, {
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
    
    console.log(`✅ Sent to ${to}`);
  } catch (error) {
    console.error("Send error:", error.response?.data || error.message);
  }
}