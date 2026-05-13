import axios from "axios";
import crypto from "crypto";
import parseMessage from "./parserService.js";
import Customer from "../models/Customer.js";
import Shopkeeper from "../models/Shopkeeper.js";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "1288881096667837";

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
  console.log("🔥 POST WEBHOOK HIT");

  try {
    console.log("🔥 RAW BODY:");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body;

    const entry = body.entry?.[0];
    console.log("🔥 ENTRY:", entry);

    const changes = entry?.changes?.[0];
    console.log("🔥 CHANGES:", changes);

    const value = changes?.value;
    console.log("🔥 VALUE:", value);

    if (value?.messages && value.messages.length > 0) {
      console.log("✅ MESSAGE ARRAY FOUND");

      const message = value.messages[0];
      console.log("🔥 MESSAGE:", message);

      const contact = value.contacts?.[0];
      console.log("🔥 CONTACT:", contact);

      const customerNumber = message.from;
      const whatsappProfileName = contact?.profile?.name || "Customer";
      const messageText = message.text?.body;

      console.log("📱 Number:", customerNumber);
      console.log("👤 Name:", whatsappProfileName);
      console.log("💬 Text:", messageText);

      await processDirectMessage(
        customerNumber,
        whatsappProfileName,
        messageText
      );

      console.log("✅ processDirectMessage FINISHED");
    } else {
      console.log("❌ NO MESSAGES FOUND");
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ FULL WEBHOOK ERROR:");
    console.error(error);

    res.sendStatus(500);
  }
}

// Direct processing without HTTP call
async function processDirectMessage(phoneNumber, whatsappProfileName, message) {
  try {
    console.log("=".repeat(60));
    console.log("📝 PROCESSING MESSAGE DIRECTLY");
    console.log("Message:", message);
    console.log("Phone:", phoneNumber);
    
    // Get or create shopkeeper
    const businessPhoneNumber = "15551644565";
    let shopkeeper = await Shopkeeper.findOne({ phoneNumber: businessPhoneNumber });
    
    if (!shopkeeper) {
      console.log("🆕 Creating shopkeeper...");
      shopkeeper = new Shopkeeper({
        whatsappBusinessAccountId: WHATSAPP_BUSINESS_ACCOUNT_ID,
        phoneNumber: businessPhoneNumber,
        shopName: "My WhatsApp Store",
        ownerName: whatsappProfileName || "Store Owner",
        email: "store@example.com",
        apiKey: crypto.randomBytes(32).toString("hex"),
        isActive: true
      });
      await shopkeeper.save();
      console.log(`✅ Shopkeeper created: ${shopkeeper._id}`);
    }
    
    const shopkeeperId = shopkeeper._id.toString();
    
    // Parse message with AI
    const parsed = await parseMessage(message);
    console.log("📊 Parsed:", JSON.stringify(parsed, null, 2));
    
    let replyMessage = "";
    
    // Handle different intents
    if (parsed.intent === "list_customers" || parsed.command === "list_customers") {
      const customers = await Customer.find({ shopkeeperId });
      if (customers.length === 0) {
        replyMessage = "📭 No customers yet. Send: Ravi 2 milk 40";
      } else {
        const lines = customers.map((c, i) => `${i+1}. ${c.name} - ₹${c.totalDue}`);
        replyMessage = `👥 CUSTOMERS:\n${lines.join("\n")}`;
      }
    } 
    else if (parsed.intent === "summary" || parsed.command === "summary") {
      const customers = await Customer.find({ shopkeeperId });
      const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
      replyMessage = `📊 SUMMARY\nCustomers: ${customers.length}\nTotal Due: ₹${totalDue}`;
    }
    else if (parsed.intent === "help" || parsed.command === "help") {
      replyMessage = `📖 COMMANDS:\nAdd: Ravi 2 milk 40\nPay: pay Ravi 20\nDue: Ravi pending\nList: list\nSummary: summary`;
    }
    else if (parsed.intent === "check_due") {
      const name = parsed.customerName;
      const customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${name}$`, "i") });
      if (!customer) {
        replyMessage = `❌ Customer "${name}" not found`;
      } else {
        replyMessage = customer.totalDue === 0 ? `✅ ${name} has no dues` : `💰 ${name} owes ₹${customer.totalDue}`;
      }
    }
    else if (parsed.intent === "payment") {
      const name = parsed.customerName;
      const amount = parsed.amount;
      const customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${name}$`, "i") });
      if (!customer) {
        replyMessage = `❌ Customer "${name}" not found`;
      } else {
        customer.transactions.push({
          itemName: "Payment Received",
          amount: amount,
          paid: amount,
          transactionType: "payment",
          originalMessage: message,
          date: new Date()
        });
        customer.totalPaid += amount;
        customer.totalAmount += amount;
        await customer.save();
        replyMessage = `✅ Payment received! ${name} paid ₹${amount}\nNew Due: ₹${customer.totalDue}`;
      }
    }
    else {
      // Add transaction
      const { customerName, itemName, quantity, amount, paid } = parsed;
      
      if (!amount || amount === 0) {
        replyMessage = "❌ Could not understand. Try: Ravi 2 milk 40";
      } else {
        const nameToUse = customerName || "Customer";
        let customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${nameToUse}$`, "i") });
        
        if (!customer) {
          customer = new Customer({
            shopkeeperId,
            name: nameToUse,
            phone: phoneNumber,
            totalAmount: amount,
            totalPaid: paid || 0,
            totalDue: amount - (paid || 0),
            transactions: [{
              itemName: itemName || "item",
              quantity: quantity || 1,
              amount: amount,
              paid: paid || 0,
              transactionType: "debit",
              originalMessage: message,
              date: new Date()
            }]
          });
          await customer.save();
          replyMessage = `🆕 NEW CUSTOMER!\n👤 ${nameToUse}\n🛒 ${quantity || 1} ${itemName || "item"} - ₹${amount}\n📊 Due: ₹${customer.totalDue}`;
        } else {
          customer.transactions.push({
            itemName: itemName || "item",
            quantity: quantity || 1,
            amount: amount,
            paid: paid || 0,
            transactionType: "debit",
            originalMessage: message,
            date: new Date()
          });
          customer.totalAmount += amount;
          customer.totalPaid += paid || 0;
          customer.totalDue = customer.totalAmount - customer.totalPaid;
          await customer.save();
          replyMessage = `✅ ADDED!\n🛒 ${quantity || 1} ${itemName || "item"} - ₹${amount}\n📊 ${nameToUse} Due: ₹${customer.totalDue}`;
        }
      }
    }
    
    console.log(`📤 Sending reply: ${replyMessage.substring(0, 80)}`);
    await sendWhatsAppMessage(phoneNumber, replyMessage);
    
  } catch (error) {
    console.error("❌ Error processing message:", error.message);
    console.error(error.stack);
    try {
      await sendWhatsAppMessage(phoneNumber, "❌ Server error. Please try again.");
    } catch (sendError) {
      console.error("Failed to send error reply:", sendError.message);
    }
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const response = await axios.post(url, {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message }
    }, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });
    
    console.log(`✅ Message sent to ${to}`);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to send message:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
    throw error;
  }
}