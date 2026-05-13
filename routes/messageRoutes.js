import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// ── MAIN ENDPOINT ── Uses parseMessage which already has AI ─────────────────
router.post("/", async (req, res) => {
  try {
    // Get data from WhatsApp webhook
    const {
      message,
      customerPhone,
      customerName: providedName,
      shopkeeperId = "default",
    } = req.body;

    console.log("=".repeat(60));
    console.log("📝 MESSAGE RECEIVED");
    console.log("Message:", message);
    console.log("Customer Phone:", customerPhone);
    console.log("Provided Name:", providedName);
    console.log("Shopkeeper ID:", shopkeeperId);
    console.log("=".repeat(60));

    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    // Use parseMessage - it already has AI to understand the message
    const parsed = await parseMessage(message);
    console.log("📊 Parsed result:", parsed);

    const {
      customerName,
      itemName,
      quantity,
      amount,
      paid,
      originalMessage,
      intent, // parseMessage should return intent type
    } = parsed;

    // Use provided name (from WhatsApp profile) or AI-extracted name
    const effectiveCustomerName = providedName || customerName;

    // ── HELP (if parseMessage detects help intent) ───────────────────────────
    if (intent === "help" || message.toLowerCase() === "help") {
      return res.json({
        success: true,
        message: `📖 *COMMANDS (Any Language)*
━━━━━━━━━━━━━━━━━━━━
🛒 *Add Transaction:*
   Ravi 2 milk 40 rs
   Ravi 2 doodh 40 rupaye

💵 *Payment:*
   pay Ravi 20
   Ravi ko 20 de diye

🔍 *Check Due:*
   Ravi pending
   Ravi baki hai

📋 *List Customers:*
   list
   sab customers dikhao

📄 *Customer Details:*
   details Ravi
   Ravi ka details

📜 *Transaction History:*
   transactions Ravi
   Ravi ki transactions

🗑️ *Delete Customer:*
   delete Ravi
   Ravi ko hatao

📊 *Summary:*
   summary

❓ *Help:*
   help`,
      });
    }

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    if (intent === "summary" || message.toLowerCase() === "summary") {
      const customers = await Customer.find({ shopkeeperId });
      const totalAmount = customers.reduce(
        (s, c) => s + (c.totalAmount || 0),
        0,
      );
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);

      return res.json({
        success: true,
        message: `📊 *SHOP SUMMARY*
━━━━━━━━━━━━━━━━━━━━
👥 Customers: ${customers.length}
🛒 Total Sales: ₹${totalAmount}
✅ Collected: ₹${totalPaid}
🔴 Total Due: ₹${totalDue}`,
      });
    }

    // ── LIST CUSTOMERS ───────────────────────────────────────────────────────
    if (intent === "list_customers" || message.toLowerCase() === "list") {
      const customers = await Customer.find({ shopkeeperId }).sort({
        createdAt: -1,
      });
      if (!customers.length) {
        return res.json({
          success: true,
          message: "📭 No customers yet. Add: *Ravi 2 milk 40 rs*",
        });
      }
      const lines = customers.map(
        (c, i) => `${i + 1}. *${c.name}* — ₹${c.totalDue}`,
      );
      const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
      return res.json({
        success: true,
        message: `👥 *CUSTOMERS* (${customers.length})\n${lines.join("\n")}\n📊 Total Due: ₹${totalDue}`,
      });
    }

    // ── DELETE CUSTOMER ──────────────────────────────────────────────────────
    if (intent === "delete_customer") {
      if (!effectiveCustomerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name to delete.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${effectiveCustomerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${effectiveCustomerName}" not found.`,
        });
      }

      await Customer.findByIdAndDelete(customer._id);
      return res.json({
        success: true,
        message: `🗑️ Deleted: *${customer.name}*`,
      });
    }

    // ── CHECK DUE ────────────────────────────────────────────────────────────
    if (intent === "check_due") {
      if (!effectiveCustomerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${effectiveCustomerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${effectiveCustomerName}" not found.`,
        });
      }

      // Update phone number if provided
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }

      return res.json({
        success: true,
        message:
          customer.totalDue === 0
            ? `✅ *${customer.name}* has no pending dues!`
            : `💰 *${customer.name}* owes ₹${customer.totalDue}`,
      });
    }

    // ── CUSTOMER DETAILS ─────────────────────────────────────────────────────
    if (intent === "customer_details") {
      if (!effectiveCustomerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${effectiveCustomerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${effectiveCustomerName}" not found.`,
        });
      }

      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }

      return res.json({
        success: true,
        message: `👤 *${customer.name}*\n📱 Phone: ${customer.phone || "N/A"}\n💰 Total: ₹${customer.totalAmount}\n✅ Paid: ₹${customer.totalPaid}\n🔴 Due: ₹${customer.totalDue}\n📝 Transactions: ${customer.transactions?.length || 0}`,
      });
    }

    // ── TRANSACTION HISTORY ──────────────────────────────────────────────────
    if (intent === "transaction_history") {
      if (!effectiveCustomerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${effectiveCustomerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${effectiveCustomerName}" not found.`,
        });
      }

      const transactions =
        customer.transactions
          ?.slice(-5)
          .reverse()
          .map((t) => `• ${t.quantity} ${t.itemName} — ₹${t.amount}`)
          .join("\n") || "No transactions yet";

      return res.json({
        success: true,
        message: `📜 *${customer.name}'s Transactions*\n${transactions}`,
      });
    }

    // ── PAYMENT ──────────────────────────────────────────────────────────────
    if (intent === "payment") {
      if (!effectiveCustomerName || !amount) {
        return res.json({
          success: false,
          message:
            "❌ Please specify customer name and amount. Example: 'pay Ravi 20'",
        });
      }

      let customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${effectiveCustomerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${effectiveCustomerName}" not found.`,
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
      });
      customer.totalPaid += amount;
      customer.totalAmount += amount;
      await customer.save();

      return res.json({
        success: true,
        message: `✅ *PAYMENT RECEIVED!*\n👤 ${customer.name}\n💵 Amount: ₹${amount}\n📊 Previous Due: ₹${prevDue}\n📊 New Due: ₹${customer.totalDue}`,
      });
    }

    // ── DEFAULT: Add Transaction ─────────────────────────────────────────────
    if (!amount || amount === 0) {
      return res.json({
        success: false,
        message: "❌ Could not understand. Try: *Ravi 2 milk 40 rs*",
      });
    }

    let customer = await Customer.findOne({
      shopkeeperId,
      name: new RegExp(`^${customerName}$`, "i"),
    });
    const isNew = !customer;

    if (isNew) {
      customer = new Customer({
        shopkeeperId, // Add shopkeeperId for multi-tenant
        name: customerName,
        phone: customerPhone || null, // Save WhatsApp number
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
          },
        ],
      });
    } else {
      // Update phone if not already set
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
      });
      customer.totalAmount += amount;
      customer.totalPaid += paid || 0;
      customer.totalDue = customer.totalAmount - customer.totalPaid;
    }
    await customer.save();

    return res.json({
      success: true,
      message: isNew
        ? `🆕 *NEW CUSTOMER!*\n👤 ${customerName}\n📱 Phone: ${customer.phone || "N/A"}\n🛒 ${quantity} ${itemName} — ₹${amount}\n📊 Due: ₹${customer.totalDue}`
        : `✅ *ADDED!*\n🛒 ${quantity} ${itemName} — ₹${amount}\n📊 ${customerName} Due: ₹${customer.totalDue}`,
    });
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

export default router;
