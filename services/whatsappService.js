import axios from "axios";
import crypto from "crypto";
import parseMessage from "./parserService.js";
import Customer from "../models/Customer.js";
import Shopkeeper from "../models/Shopkeeper.js";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID =
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "1288881096667837";

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
  res.sendStatus(200);

  try {
    console.log("=".repeat(60));
    console.log("📨 WEBHOOK RECEIVED");
    console.log("Time:", new Date().toISOString());

    const body = req.body;
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes?.[0];
    if (!changes) return;

    const value = changes.value;

    if (value.messages && value.messages.length > 0) {
      const message = value.messages[0];

      if (message.type !== "text" || !message.text?.body) {
        console.log("⚠️ Skipping non-text message:", message.type);
        return;
      }

      const contact = value.contacts?.[0];
      const customerNumber = message.from;
      const whatsappProfileName = contact?.profile?.name || "Customer";
      const messageText = message.text.body;

      console.log(`✅ TEXT MESSAGE FOUND!`);
      console.log(`📱 Customer: ${whatsappProfileName} (${customerNumber})`);
      console.log(`💬 Message: "${messageText}"`);

      await processMessage(customerNumber, whatsappProfileName, messageText);
    } else if (value.statuses) {
      console.log(`ℹ️ Status update: ${value.statuses[0]?.status}`);
    }
  } catch (error) {
    console.error("❌ Webhook processing error:", error.message);
  }
}

async function processMessage(phoneNumber, whatsappProfileName, message) {
  try {
    console.log("=".repeat(60));
    console.log("📝 PROCESSING MESSAGE DIRECTLY");

    // ✅ AUTO-CREATE OR GET SHOPKEEPER
    const businessPhoneNumber = "15551644565"; // Your WhatsApp Business number
    let shopkeeper = await Shopkeeper.findOne({
      phoneNumber: businessPhoneNumber,
    });

    if (!shopkeeper) {
      console.log("🆕 No shopkeeper found. Creating one automatically...");
      shopkeeper = new Shopkeeper({
        whatsappBusinessAccountId: WHATSAPP_BUSINESS_ACCOUNT_ID,
        phoneNumber: businessPhoneNumber,
        shopName: "My WhatsApp Store",
        ownerName: whatsappProfileName || "Store Owner",
        email: "store@example.com",
        apiKey: crypto.randomBytes(32).toString("hex"),
        isActive: true,
      });
      await shopkeeper.save();
      console.log(
        `✅ Shopkeeper created: ${shopkeeper.shopName} (ID: ${shopkeeper._id})`,
      );
    }

    const shopkeeperId = shopkeeper._id.toString();
    console.log(
      `🏪 Using shopkeeper: ${shopkeeper.shopName} (${shopkeeperId})`,
    );

    // Parse the message using AI
    const parsed = await parseMessage(message);
    console.log("📊 Parsed result:", parsed);

    let replyMessage = "";

    // ── LIST CUSTOMERS ───────────────────────────────────────────────────
    if (
      parsed.command === "list_customers" ||
      parsed.intent === "list_customers"
    ) {
      const customers = await Customer.find({ shopkeeperId }).sort({
        createdAt: -1,
      });
      if (!customers.length) {
        replyMessage = "📭 No customers yet. Add: *Ravi 2 milk 40 rs*";
      } else {
        const lines = customers.map(
          (c, i) => `${i + 1}. *${c.name}* — ₹${c.totalDue}`,
        );
        const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
        replyMessage = `👥 *CUSTOMERS* (${customers.length})\n${lines.join("\n")}\n📊 Total Due: ₹${totalDue}`;
      }
    }

    // ── SUMMARY ──────────────────────────────────────────────────────────
    else if (parsed.command === "summary" || parsed.intent === "summary") {
      const customers = await Customer.find({ shopkeeperId });
      const totalAmount = customers.reduce(
        (s, c) => s + (c.totalAmount || 0),
        0,
      );
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);
      replyMessage = `📊 *SHOP SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n👥 Customers: ${customers.length}\n🛒 Total Sales: ₹${totalAmount}\n✅ Collected: ₹${totalPaid}\n🔴 Total Due: ₹${totalDue}`;
    }

    // ── HELP ─────────────────────────────────────────────────────────────
    else if (parsed.command === "help" || parsed.intent === "help") {
      replyMessage = `📖 *COMMANDS (Any Language)*\n━━━━━━━━━━━━━━━━━━━━\n🛒 Add: Ravi 2 milk 40\n💵 Pay: pay Ravi 20\n🔍 Due: Ravi pending\n📋 List: list\n📊 Summary: summary\n❓ Help: help`;
    }

    // ── CHECK DUE ────────────────────────────────────────────────────────
    else if (parsed.command === "check_due" || parsed.intent === "check_due") {
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
          if (phoneNumber && !customer.phone) {
            customer.phone = phoneNumber;
            await customer.save();
          }
          replyMessage =
            customer.totalDue === 0
              ? `✅ *${customer.name}* has no pending dues!`
              : `💰 *${customer.name}* owes ₹${customer.totalDue}`;
        }
      }
    }

    // ── PAYMENT ──────────────────────────────────────────────────────────
    else if (parsed.command === "payment" || parsed.intent === "payment") {
      const name = parsed.customerName;
      const amount = parsed.amount;

      if (!name || !amount) {
        replyMessage =
          "❌ Please specify customer name and amount. Example: 'pay Ravi 20'";
      } else {
        const customer = await Customer.findOne({
          shopkeeperId,
          name: new RegExp(`^${name}$`, "i"),
        });
        if (!customer) {
          replyMessage = `❌ Customer "${name}" not found.`;
        } else {
          if (phoneNumber && !customer.phone) customer.phone = phoneNumber;

          const prevDue = customer.totalDue;
          customer.transactions.push({
            itemName: "Payment Received",
            amount: amount,
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
    }

    // ── ADD TRANSACTION (default) ────────────────────────────────────────
    else {
      const {
        customerName: parsedName,
        itemName,
        quantity,
        amount,
        paid,
        originalMessage,
      } = parsed;

      if (!amount || amount === 0) {
        replyMessage = "❌ Could not understand. Try: *Ravi 2 milk 40 rs*";
      } else {
        const nameToUse = parsedName;

        console.log(`🔍 Looking for customer: ${nameToUse}`);

        let customer = await Customer.findOne({
          shopkeeperId,
          name: new RegExp(`^${nameToUse}$`, "i"),
        });

        const isNew = !customer;

        if (isNew) {
          console.log(`🆕 Creating new customer: ${nameToUse}`);
          customer = new Customer({
            shopkeeperId,
            name: nameToUse,
            phone: phoneNumber || null,
            totalAmount: amount,
            totalPaid: paid || 0,
            totalDue: amount - (paid || 0),
            transactions: [
              {
                itemName: itemName || "item",
                quantity: quantity || 1,
                amount: amount,
                paid: paid || 0,
                transactionType: "debit",
                originalMessage: originalMessage || message,
                date: new Date(),
              },
            ],
          });
        } else {
          console.log(
            `📝 Adding transaction to existing customer: ${nameToUse}`,
          );
          if (phoneNumber && !customer.phone) customer.phone = phoneNumber;

          customer.transactions.push({
            itemName: itemName || "item",
            quantity: quantity || 1,
            amount: amount,
            paid: paid || 0,
            transactionType: "debit",
            originalMessage: originalMessage || message,
            date: new Date(),
          });
          customer.totalAmount += amount;
          customer.totalPaid += paid || 0;
          customer.totalDue = customer.totalAmount - customer.totalPaid;
        }

        await customer.save();
        console.log(
          `✅ Saved! Customer: ${customer.name}, Due: ₹${customer.totalDue}`,
        );

        replyMessage = isNew
          ? `🆕 *NEW CUSTOMER!*\n👤 ${nameToUse}\n📱 Phone: ${customer.phone || "N/A"}\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 Due: ₹${customer.totalDue}`
          : `✅ *ADDED!*\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 ${nameToUse} Due: ₹${customer.totalDue}`;
      }
    }

    console.log(`📤 Sending reply...`);
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
      console.error("❌ Failed to send error reply:", sendError.message);
    }
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
