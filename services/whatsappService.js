import axios from "axios";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

export async function handleIncomingMessage(req, res) {
  try {
    res.sendStatus(200);

    const body = req.body;

    if (
      body.object === "whatsapp_business_account" &&
      body.entry?.[0]?.changes?.[0]?.value?.messages
    ) {
      const messages = body.entry[0].changes[0].value.messages;
      const contact = body.entry[0].changes[0].value.contacts?.[0];
      const customerNumber = contact?.wa_id;
      const customerName = contact?.profile?.name;
      const message = messages[0];

      // Get WhatsApp Business Account ID from the webhook
      const whatsappBusinessAccountId = body.entry[0].id;

      if (message.type === "text") {
        const text = message.text.body;
        console.log(
          `💬 Message from ${customerName} (${customerNumber}) to account ${whatsappBusinessAccountId}: ${text}`,
        );

        // Process message with shopkeeper context
        await processWhatsAppMessage(
          customerNumber,
          customerName,
          text,
          whatsappBusinessAccountId,
        );
      }
    }
  } catch (error) {
    console.error("Error processing webhook:", error.message);
  }
}

async function processWhatsAppMessage(
  phoneNumber,
  customerName,
  text,
  whatsappBusinessAccountId,
) {
  try {
    const response = await axios.post(`${process.env.API_URL}/message`, {
      message: text,
      customerPhone: phoneNumber,
      customerName: customerName,
      whatsappBusinessAccountId: whatsappBusinessAccountId, // Pass shopkeeper ID
    });

    if (response.data.success) {
      await sendWhatsAppMessage(phoneNumber, response.data.message);
    } else {
      await sendWhatsAppMessage(phoneNumber, `❌ ${response.data.message}`);
    }
  } catch (error) {
    console.error("Error processing:", error.message);
    await sendWhatsAppMessage(
      phoneNumber,
      "❌ Server error. Please try again later.",
    );
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    await axios.post(
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
      },
    );

    console.log(`✅ Message sent to ${to}`);
  } catch (error) {
    console.error(
      "Error sending message:",
      error.response?.data || error.message,
    );
  }
}

export { verifyWebhook, handleIncomingMessage, sendWhatsAppMessage };
