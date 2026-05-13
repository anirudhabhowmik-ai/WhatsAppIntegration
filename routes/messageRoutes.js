import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// ── MAIN ENDPOINT ── Uses parseMessage (which already has AI) ─────────────────
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
    console.log("📝 MESSAGE RECEIVED IN ROUTER");
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

    // Handle special commands from parseService
    if (
      parsed.command === "list_customers" ||
      parsed.intent === "list_customers"
    ) {
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

    if (parsed.command === "summary" || parsed.intent === "summary") {
      const customers = await Customer.find({ shopkeeperId });
      const totalAmount = customers.reduce(
        (s, c) => s + (c.totalAmount || 0),
        0,
      );
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);

      return res.json({
        success: true,
        message: `📊 *SHOP SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n👥 Customers: ${customers.length}\n🛒 Total Sales: ₹${totalAmount}\n✅ Collected: ₹${totalPaid}\n🔴 Total Due: ₹${totalDue}`,
      });
    }

    if (parsed.command === "help" || parsed.intent === "help") {
      return res.json({
        success: true,
        message: `📖 *COMMANDS (Any Language)*\n━━━━━━━━━━━━━━━━━━━━\n🛒 Add: Ravi 2 milk 40\n💵 Pay: pay Ravi 20\n🔍 Due: Ravi pending\n📋 List: list\n📊 Summary: summary\n❓ Help: help`,
      });
    }

    if (parsed.command === "check_due" || parsed.intent === "check_due") {
      const customerName = parsed.customerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
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
            ? `✅ *${customer.name}* has no pending dues!`
            : `💰 *${customer.name}* owes ₹${customer.totalDue}`,
      });
    }

    if (parsed.command === "payment" || parsed.intent === "payment") {
      const customerName = parsed.customerName;
      const amount = parsed.amount;

      if (!customerName || !amount) {
        return res.json({
          success: false,
          message:
            "❌ Please specify customer name and amount. Example: 'pay Ravi 20'",
        });
      }

      let customer = await Customer.findOne({
        shopkeeperId,
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
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
    const { customerName, itemName, quantity, amount, paid, originalMessage } =
      parsed;

    if (!amount || amount === 0) {
      return res.json({
        success: false,
        message: "❌ Could not understand. Try: *Ravi 2 milk 40 rs*",
      });
    }

    // FIX: Use effectiveCustomerName (from WhatsApp profile) or parsed customerName
    const nameToUse = providedName || customerName;

    console.log(`🔍 Looking for customer with name: ${nameToUse}`);

    let customer = await Customer.findOne({
      shopkeeperId,
      name: new RegExp(`^${nameToUse}$`, "i"),
    });

    const isNew = !customer;
    console.log(`Customer exists: ${!isNew}, isNew: ${isNew}`);

    if (isNew) {
      console.log(`🆕 Creating new customer: ${nameToUse}`);
      customer = new Customer({
        shopkeeperId,
        name: nameToUse, // Use nameToUse instead of customerName
        phone: customerPhone || null,
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
      console.log(`📝 Adding transaction to existing customer: ${nameToUse}`);
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
      }

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
      `✅ Saved to MongoDB. Customer ID: ${customer._id}, Total Due: ${customer.totalDue}`,
    );

    return res.json({
      success: true,
      message: isNew
        ? `🆕 *NEW CUSTOMER!*\n👤 ${nameToUse}\n📱 Phone: ${customer.phone || "N/A"}\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 Due: ₹${customer.totalDue}`
        : `✅ *ADDED!*\n🛒 ${quantity || 1} ${itemName || "item"} — ₹${amount}\n📊 ${nameToUse} Due: ₹${customer.totalDue}`,
    });
  } catch (error) {
    console.error("❌ Error in message endpoint:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

export default router;
