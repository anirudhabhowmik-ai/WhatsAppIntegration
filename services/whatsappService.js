import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import parseMessage from "./parserService.js";
import Customer from "../models/Customer.js";
import Shopkeeper from "../models/Shopkeeper.js";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID =
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "1288881096667837";

// Log on startup to confirm env vars are loaded
console.log("🔧 ENV CHECK:");
console.log(
  "  VERIFY_TOKEN:",
  VERIFY_TOKEN ? `"${VERIFY_TOKEN}" ✅` : "❌ NOT SET",
);
console.log("  PHONE_NUMBER_ID:", PHONE_NUMBER_ID ? "✅ set" : "❌ NOT SET");
console.log("  WHATSAPP_TOKEN:", WHATSAPP_TOKEN ? "✅ set" : "❌ NOT SET");

export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification attempt:");
  console.log("  mode:", mode);
  console.log("  token received:", `"${token}"`);
  console.log("  token expected:", `"${VERIFY_TOKEN}"`);
  console.log("  match:", token === VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified! Sending challenge:", challenge);
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

    // Always respond 200 immediately so Meta doesn't retry
    res.sendStatus(200);

    const body = req.body;
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (value?.messages && value.messages.length > 0) {
      console.log("✅ MESSAGE FOUND");

      const message = value.messages[0];

      // Only handle text messages
      if (message.type !== "text" || !message.text?.body) {
        console.log("⚠️ Skipping non-text message:", message.type);
        return;
      }

      const contact = value.contacts?.[0];
      const customerNumber = message.from;
      const whatsappProfileName = contact?.profile?.name || "Customer";
      const messageText = message.text.body;

      console.log("📱 Number:", customerNumber);
      console.log("👤 Name:", whatsappProfileName);
      console.log("💬 Text:", messageText);

      await processDirectMessage(
        customerNumber,
        whatsappProfileName,
        messageText,
      );

      console.log("✅ processDirectMessage FINISHED");
    } else if (value?.statuses) {
      console.log("ℹ️ Status update:", value.statuses[0]?.status);
    } else {
      console.log("ℹ️ No messages in this webhook");
    }
  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error.message);
    console.error(error.stack);
  }
}

async function processDirectMessage(phoneNumber, whatsappProfileName, message) {
  try {
    console.log("=".repeat(60));
    console.log("📝 PROCESSING MESSAGE DIRECTLY");
    console.log("Message:", message);
    console.log("Phone:", phoneNumber);

    // Get or create shopkeeper
    const businessPhoneNumber = "15551644565";
    let shopkeeper = await Shopkeeper.findOne({
      phoneNumber: businessPhoneNumber,
    });

    if (!shopkeeper) {
      console.log("🆕 Creating shopkeeper...");
      shopkeeper = new Shopkeeper({
        whatsappBusinessAccountId: WHATSAPP_BUSINESS_ACCOUNT_ID,
        phoneNumber: businessPhoneNumber,
        shopName: "My WhatsApp Store",
        ownerName: "Store Owner",
        email: "store@example.com",
        apiKey: crypto.randomBytes(32).toString("hex"),
        isActive: true,
      });
      await shopkeeper.save();
      console.log(`✅ Shopkeeper created: ${shopkeeper._id}`);
    }

    const shopkeeperId = shopkeeper._id.toString();
    console.log("🏪 ShopkeeperID:", shopkeeperId);

    // Parse message with AI
    const parsed = await parseMessage(message);
    console.log("📊 Parsed:", JSON.stringify(parsed, null, 2));

    let replyMessage = "";

    // Handle intents
    if (
      parsed.intent === "list_customers" ||
      parsed.command === "list_customers"
    ) {
      const customers = await Customer.find({ shopkeeperId });
      if (customers.length === 0) {
        replyMessage = "📭 No customers yet.\nAdd one: *Ravi 2 milk 40*";
      } else {
        const lines = customers.map(
          (c, i) => `${i + 1}. *${c.name}* — ₹${c.totalDue}`,
        );
        const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
        replyMessage = `👥 *CUSTOMERS* (${customers.length})\n${lines.join("\n")}\n📊 Total Due: ₹${totalDue}`;
      }
    } else if (parsed.intent === "summary" || parsed.command === "summary") {
      const customers = await Customer.find({ shopkeeperId });
      const totalAmount = customers.reduce((s, c) => s + c.totalAmount, 0);
      const totalPaid = customers.reduce((s, c) => s + c.totalPaid, 0);
      const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
      replyMessage = `📊 *SHOP SUMMARY*\n👥 Customers: ${customers.length}\n🛒 Total Sales: ₹${totalAmount}\n✅ Collected: ₹${totalPaid}\n🔴 Total Due: ₹${totalDue}`;
    } else if (parsed.intent === "help" || parsed.command === "help") {
      replyMessage = `📖 *COMMANDS*\n\n🛒 Add: Ravi 2 milk 40\n💵 Pay: pay Ravi 20\n🔍 Due: Ravi pending\n📋 List: list\n📊 Summary: summary\n❓ Help: help`;
    } else if (parsed.intent === "check_due") {
      const name = parsed.customerName;
      if (!name) {
        replyMessage = "❌ Please specify customer name.";
      } else {
        const customer = await Customer.findOne({
          shopkeeperId,
          name: new RegExp(`^${name}$`, "i"),
        });
        if (!customer) {
          replyMessage = `❌ Customer "${name}" not found.`;
        } else {
          replyMessage =
            customer.totalDue === 0
              ? `✅ *${name}* has no pending dues!`
              : `💰 *${name}* owes ₹${customer.totalDue}`;
        }
      }
    } else if (parsed.intent === "delete_customer") {
      const name = parsed.customerName;
      if (!name) {
        replyMessage = "❌ Please specify customer name to delete.";
      } else {
        const customer = await Customer.findOneAndDelete({
          shopkeeperId,
          name: new RegExp(`^${name}$`, "i"),
        });
        replyMessage = customer
          ? `🗑️ Deleted: *${customer.name}*`
          : `❌ Customer "${name}" not found.`;
      }
    } else if (parsed.intent === "payment") {
      const name = parsed.customerName;
      const amount = parsed.amount;
      if (!name || !amount) {
        replyMessage =
          "❌ Please specify name and amount. Example: *pay Ravi 20*";
      } else {
        const customer = await Customer.findOne({
          shopkeeperId,
          name: new RegExp(`^${name}$`, "i"),
        });
        if (!customer) {
          replyMessage = `❌ Customer "${name}" not found.`;
        } else {
          const prevDue = customer.totalDue;
          customer.transactions.push({
            itemName: "Payment Received",
            amount,
            paid: amount,
            transactionType: "payment",
            originalMessage: message,
            date: new Date(),
          });
          customer.totalPaid += amount;
          customer.totalAmount += amount;
          await customer.save();
          replyMessage = `✅ *PAYMENT RECEIVED!*\n👤 ${customer.name}\n💵 Amount: ₹${amount}\n📊 Previous Due: ₹${prevDue}\n📊 New Due: ₹${customer.totalDue}`;
        }
      }
    } else {
      // Default: Add transaction
      const { customerName, itemName, quantity, amount, paid } = parsed;

      if (!amount || amount === 0) {
        replyMessage = "❌ Could not understand.\nTry: *Ravi 2 milk 40 rs*";
      } else {
        const nameToUse = customerName || whatsappProfileName || "Customer";
        let customer = await Customer.findOne({
          shopkeeperId,
          name: new RegExp(`^${nameToUse}$`, "i"),
        });

        if (!customer) {
          customer = new Customer({
            shopkeeperId,
            name: nameToUse,
            phone: phoneNumber,
            totalAmount: amount,
            totalPaid: paid || 0,
            totalDue: amount - (paid || 0),
            transactions: [
              {
                itemName: itemName || "item",
                quantity: quantity || 1,
                amount,
                paid: paid || 0,
                transactionType: "debit",
                originalMessage: message,
                date: new Date(),
              },
            ],
          });
          await customer.save();
          console.log(`✅ New customer saved: ${nameToUse}`);
          replyMessage = `🆕 *NEW CUSTOMER!*\n👤 ${nameToUse}\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 Due: ₹${customer.totalDue}`;
        } else {
          customer.transactions.push({
            itemName: itemName || "item",
            quantity: quantity || 1,
            amount,
            paid: paid || 0,
            transactionType: "debit",
            originalMessage: message,
            date: new Date(),
          });
          customer.totalAmount += amount;
          customer.totalPaid += paid || 0;
          customer.totalDue = customer.totalAmount - customer.totalPaid;
          await customer.save();
          console.log(`✅ Transaction added for: ${nameToUse}`);
          replyMessage = `✅ *ADDED!*\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 *${nameToUse}* Due: ₹${customer.totalDue}`;
        }
      }
    }

    console.log(`📤 Sending reply: ${replyMessage.substring(0, 100)}`);
    await sendWhatsAppMessage(phoneNumber, replyMessage);
  } catch (error) {
    console.error("❌ Error processing message:", error.message);
    console.error(error.stack);
    try {
      await sendWhatsAppMessage(
        phoneNumber,
        "❌ Server error. Please try again.",
      );
    } catch (sendError) {
      console.error("Failed to send error reply:", sendError.message);
    }
  }
}

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    console.log(`📤 Sending WhatsApp message to ${to}...`);

    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
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
