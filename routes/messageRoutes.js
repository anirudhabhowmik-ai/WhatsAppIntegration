import express from "express";
import Customer from "../models/Customer.js";
import Shopkeeper from "../models/Shopkeeper.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper to get shopkeeper by WhatsApp Business Account ID
async function getShopkeeper(whatsappBusinessAccountId) {
  return await Shopkeeper.findOne({ whatsappBusinessAccountId });
}

// AI intent recognition (same as before, but shopkeeper-aware)
async function understandIntent(message) {
  // ... (your existing understandIntent function)
  // Keeping it the same as before
}

// MAIN ENDPOINT - Now with shopkeeper support
router.post("/", async (req, res) => {
  try {
    const {
      message,
      customerPhone,
      customerName: providedName,
      whatsappBusinessAccountId, // NEW: Identify which shopkeeper
    } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    if (!whatsappBusinessAccountId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Shopkeeper identification required",
        });
    }

    // Find the shopkeeper
    const shopkeeper = await getShopkeeper(whatsappBusinessAccountId);
    if (!shopkeeper) {
      return res.json({
        success: false,
        message: "❌ Shopkeeper not registered. Please register first.",
      });
    }

    // Update last active
    shopkeeper.lastActive = new Date();
    await shopkeeper.save();

    // Use AI to understand intent
    const intent = await understandIntent(message);
    const effectiveCustomerName = providedName || intent.customerName;

    // All database queries now include shopkeeperId
    // ── HELP ──────────────────────────────────────────────────────────────────
    if (intent.intent === "help") {
      return res.json({
        success: true,
        message: `📖 *${shopkeeper.shopName} - Commands*\n━━━━━━━━━━━━━━━━━━━━\n🛒 Add: Ravi 2 milk 40\n💵 Pay: pay Ravi 20\n🔍 Due: Ravi pending\n📋 List: list\n📄 Details: details Ravi\n📜 History: transactions Ravi\n📊 Summary: summary\n❓ Help: help`,
      });
    }

    // ── SUMMARY (Shopkeeper-specific) ─────────────────────────────────────────
    if (intent.intent === "summary") {
      const customers = await Customer.find({ shopkeeperId: shopkeeper._id });
      const totalAmount = customers.reduce(
        (s, c) => s + (c.totalAmount || 0),
        0,
      );
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);

      return res.json({
        success: true,
        message: `📊 *${shopkeeper.shopName} - SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n👥 Customers: ${customers.length}\n🛒 Total Sales: ${shopkeeper.settings.currency}${totalAmount}\n✅ Collected: ${shopkeeper.settings.currency}${totalPaid}\n🔴 Total Due: ${shopkeeper.settings.currency}${totalDue}`,
      });
    }

    // ── LIST CUSTOMERS (Shopkeeper-specific) ──────────────────────────────────
    if (intent.intent === "list_customers") {
      const customers = await Customer.find({
        shopkeeperId: shopkeeper._id,
      }).sort({ createdAt: -1 });
      if (!customers.length) {
        return res.json({
          success: true,
          message: `📭 No customers yet for ${shopkeeper.shopName}. Add: *Ravi 2 milk 40 rs*`,
        });
      }
      const lines = customers.map(
        (c, i) =>
          `${i + 1}. *${c.name}* — ${shopkeeper.settings.currency}${c.totalDue}`,
      );
      const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
      return res.json({
        success: true,
        message: `👥 *${shopkeeper.shopName} - CUSTOMERS* (${customers.length})\n${lines.join("\n")}\n📊 Total Due: ${shopkeeper.settings.currency}${totalDue}`,
      });
    }

    // ── DELETE CUSTOMER ────────────────────────────────────────────────────────
    if (intent.intent === "delete_customer") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name to delete.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId: shopkeeper._id,
        name: new RegExp(`^${customerName}$`, "i"),
      });

      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found in your shop.`,
        });
      }

      await Customer.findByIdAndDelete(customer._id);
      return res.json({
        success: true,
        message: `🗑️ Deleted: *${customer.name}* from ${shopkeeper.shopName}`,
      });
    }

    // ── CHECK DUE ──────────────────────────────────────────────────────────────
    if (intent.intent === "check_due") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId: shopkeeper._id,
        name: new RegExp(`^${customerName}$`, "i"),
      });

      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found in ${shopkeeper.shopName}.`,
        });
      }

      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }

      return res.json({
        success: true,
        message:
          customer.totalDue === 0
            ? `✅ *${customer.name}* has no pending dues at ${shopkeeper.shopName}!`
            : `💰 *${customer.name}* owes ${shopkeeper.settings.currency}${customer.totalDue} to ${shopkeeper.shopName}`,
      });
    }

    // ── CUSTOMER DETAILS ───────────────────────────────────────────────────────
    if (intent.intent === "customer_details") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId: shopkeeper._id,
        name: new RegExp(`^${customerName}$`, "i"),
      });

      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found in ${shopkeeper.shopName}.`,
        });
      }

      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }

      return res.json({
        success: true,
        message: `👤 *${customer.name}* (${shopkeeper.shopName})\n📱 Phone: ${customer.phone || "N/A"}\n💰 Total: ${shopkeeper.settings.currency}${customer.totalAmount}\n✅ Paid: ${shopkeeper.settings.currency}${customer.totalPaid}\n🔴 Due: ${shopkeeper.settings.currency}${customer.totalDue}\n📝 Transactions: ${customer.transactions?.length || 0}`,
      });
    }

    // ── TRANSACTION HISTORY ────────────────────────────────────────────────────
    if (intent.intent === "transaction_history") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId: shopkeeper._id,
        name: new RegExp(`^${customerName}$`, "i"),
      });

      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found in ${shopkeeper.shopName}.`,
        });
      }

      const transactions =
        customer.transactions
          ?.slice(-5)
          .reverse()
          .map(
            (t) =>
              `• ${t.quantity} ${t.itemName} — ${shopkeeper.settings.currency}${t.amount}`,
          )
          .join("\n") || "No transactions yet";

      return res.json({
        success: true,
        message: `📜 *${customer.name}'s Transactions at ${shopkeeper.shopName}*\n${transactions}`,
      });
    }

    // ── PAYMENT ────────────────────────────────────────────────────────────────
    if (intent.intent === "payment") {
      const customerName = effectiveCustomerName;
      const amount = intent.amount;

      if (!customerName || !amount) {
        return res.json({
          success: false,
          message:
            "❌ Please specify customer name and amount. Example: 'pay Ravi 20'",
        });
      }

      let customer = await Customer.findOne({
        shopkeeperId: shopkeeper._id,
        name: new RegExp(`^${customerName}$`, "i"),
      });

      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found in ${shopkeeper.shopName}.`,
        });
      }

      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
      }

      const prevDue = customer.totalDue;
      customer.transactions.push({
        itemName: "Payment Received",
        amount: amount,
        paid: amount,
        transactionType: "payment",
        originalMessage: message,
        date: new Date(),
        addedBy: shopkeeper._id,
      });
      customer.totalPaid += amount;
      customer.totalAmount += amount;
      await customer.save();

      return res.json({
        success: true,
        message: `✅ *PAYMENT RECEIVED at ${shopkeeper.shopName}!*\n👤 ${customer.name}\n💵 Amount: ${shopkeeper.settings.currency}${amount}\n📊 Previous Due: ${shopkeeper.settings.currency}${prevDue}\n📊 New Due: ${shopkeeper.settings.currency}${customer.totalDue}`,
      });
    }

    // ── DEFAULT: Add Transaction ───────────────────────────────────────────────
    const parsed = await parseMessage(message);
    const { customerName, itemName, quantity, amount, paid, originalMessage } =
      parsed;

    if (!amount || amount === 0) {
      return res.json({
        success: false,
        message: "❌ Could not understand. Try: *Ravi 2 milk 40 rs*",
      });
    }

    let customer = await Customer.findOne({
      shopkeeperId: shopkeeper._id,
      name: new RegExp(`^${customerName}$`, "i"),
    });

    const isNew = !customer;

    if (isNew) {
      customer = new Customer({
        shopkeeperId: shopkeeper._id,
        name: customerName,
        phone: customerPhone || null,
        totalAmount: amount,
        totalPaid: paid || 0,
        totalDue: amount - (paid || 0),
        transactions: [
          {
            itemName,
            quantity,
            amount,
            paid: paid || 0,
            transactionType: "debit",
            originalMessage,
            date: new Date(),
            addedBy: shopkeeper._id,
          },
        ],
      });
    } else {
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
      }

      customer.transactions.push({
        itemName,
        quantity,
        amount,
        paid: paid || 0,
        transactionType: "debit",
        originalMessage,
        date: new Date(),
        addedBy: shopkeeper._id,
      });
      customer.totalAmount += amount;
      customer.totalPaid += paid || 0;
      customer.totalDue = customer.totalAmount - customer.totalPaid;
    }
    await customer.save();

    return res.json({
      success: true,
      message: isNew
        ? `🆕 *NEW CUSTOMER at ${shopkeeper.shopName}!*\n👤 ${customerName}\n📱 Phone: ${customer.phone || "N/A"}\n🛒 ${quantity} ${itemName} — ${shopkeeper.settings.currency}${amount}\n📊 Due: ${shopkeeper.settings.currency}${customer.totalDue}`
        : `✅ *ADDED to ${shopkeeper.shopName}!*\n🛒 ${quantity} ${itemName} — ${shopkeeper.settings.currency}${amount}\n📊 ${customerName} Due: ${shopkeeper.settings.currency}${customer.totalDue}`,
    });
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

export default router;
