import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// Helper function to parse command from message
function parseCommand(message) {
  const msg = message.toLowerCase().trim();

  // Help command
  if (msg === "help" || msg === "?" || msg === "start") {
    return { command: "help" };
  }

  // List command
  if (
    msg === "list" ||
    msg === "customers" ||
    msg === "all customers" ||
    msg === "sab customers"
  ) {
    return { command: "list" };
  }

  // Summary command
  if (msg === "summary" || msg === "stats" || msg === "report") {
    return { command: "summary" };
  }

  // Delete command - delete Ravi, remove Ravi
  const deleteMatch = message.match(
    /^(delete|remove|hatao)\s+(customer\s+)?(\w+)/i,
  );
  if (deleteMatch) {
    return { command: "delete", customerName: deleteMatch[3] };
  }

  // Details command - details Ravi, info Ravi
  const detailsMatch = message.match(/^(details|info|customer)\s+(\w+)/i);
  if (detailsMatch) {
    return { command: "details", customerName: detailsMatch[2] };
  }

  // Transactions command - transactions Ravi, history Ravi
  const transactionsMatch = message.match(/^(transactions|history)\s+(\w+)/i);
  if (transactionsMatch) {
    return { command: "transactions", customerName: transactionsMatch[2] };
  }

  // Due command - due Ravi, pending Ravi, baki Ravi
  let dueMatch = message.match(/^(due|pending|baki)\s+(\w+)/i);
  if (dueMatch) {
    return { command: "due", customerName: dueMatch[2] };
  }

  // "Ravi due" pattern
  dueMatch = message.match(/^(\w+)\s+(due|pending|baki)$/i);
  if (dueMatch) {
    return { command: "due", customerName: dueMatch[1] };
  }

  // Pay command - pay Ravi 20
  let payMatch = message.match(/^(pay|payment)\s+(\w+)\s+(\d+)/i);
  if (payMatch) {
    return {
      command: "pay",
      customerName: payMatch[2],
      amount: parseInt(payMatch[3]),
    };
  }

  // "Ravi ko 20 de diye" pattern
  payMatch = message.match(/^(\w+)\s+ko\s+(\d+)\s+(de diye|de diya|paid)/i);
  if (payMatch) {
    return {
      command: "pay",
      customerName: payMatch[1],
      amount: parseInt(payMatch[2]),
    };
  }

  // No command - treat as transaction
  return { command: "transaction", message };
}

// ── ONLY ONE ENDPOINT ── Handles EVERYTHING ──────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    const parsed = parseCommand(message);
    console.log("📝 Command:", parsed);

    // ── HELP ──────────────────────────────────────────────────────────────────
    if (parsed.command === "help") {
      return res.json({
        success: true,
        message: `📖 *COMMANDS*
━━━━━━━━━━━━━━━━━━━━
🛒 *Add:* Ravi 2 milk 40 rs
💵 *Pay:* pay Ravi 20
🔍 *Due:* due Ravi / Ravi pending
📋 *List:* list
📄 *Details:* details Ravi
📜 *History:* transactions Ravi
🗑️ *Delete:* delete Ravi
📊 *Summary:* summary
❓ *Help:* help`,
      });
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (parsed.command === "list") {
      const customers = await Customer.find().sort({ createdAt: -1 });
      if (!customers.length) {
        return res.json({
          success: true,
          message: "📭 No customers yet. Add: *Ravi 2 milk 40 rs*",
        });
      }
      const lines = customers.map(
        (c, i) => `${i + 1}. *${c.name}* — Due: ₹${c.totalDue}`,
      );
      const totalDue = customers.reduce((s, c) => s + c.totalDue, 0);
      return res.json({
        success: true,
        message: `👥 *CUSTOMERS* (${customers.length})\n${lines.join("\n")}\n📊 Total Due: ₹${totalDue}`,
      });
    }

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    if (parsed.command === "summary") {
      const customers = await Customer.find();
      const totalAmount = customers.reduce(
        (s, c) => s + (c.totalAmount || 0),
        0,
      );
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);
      return res.json({
        success: true,
        message: `📊 *SUMMARY*\n━━━━━━━━━━━━━━━━━━━━\n👥 Customers: ${customers.length}\n🛒 Sales: ₹${totalAmount}\n✅ Collected: ₹${totalPaid}\n🔴 Due: ₹${totalDue}`,
      });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (parsed.command === "delete") {
      const customer = await Customer.findOne({
        name: new RegExp(`^${parsed.customerName}$`, "i"),
      });
      if (!customer)
        return res.json({
          success: false,
          message: `❌ "${parsed.customerName}" not found`,
        });
      await Customer.findByIdAndDelete(customer._id);
      return res.json({
        success: true,
        message: `🗑️ Deleted: *${customer.name}*`,
      });
    }

    // ── DETAILS ───────────────────────────────────────────────────────────────
    if (parsed.command === "details") {
      const customer = await Customer.findOne({
        name: new RegExp(`^${parsed.customerName}$`, "i"),
      });
      if (!customer)
        return res.json({
          success: false,
          message: `❌ "${parsed.customerName}" not found`,
        });
      return res.json({
        success: true,
        message: `👤 *${customer.name}*\n📱 Phone: ${customer.phone || "N/A"}\n💰 Total: ₹${customer.totalAmount}\n✅ Paid: ₹${customer.totalPaid}\n🔴 Due: ₹${customer.totalDue}`,
      });
    }

    // ── TRANSACTIONS HISTORY ──────────────────────────────────────────────────
    if (parsed.command === "transactions") {
      const customer = await Customer.findOne({
        name: new RegExp(`^${parsed.customerName}$`, "i"),
      });
      if (!customer)
        return res.json({
          success: false,
          message: `❌ "${parsed.customerName}" not found`,
        });
      const tx =
        customer.transactions
          ?.slice(-5)
          .reverse()
          .map((t) => `• ${t.quantity} ${t.itemName} — ₹${t.amount}`)
          .join("\n") || "No transactions";
      return res.json({
        success: true,
        message: `📜 *${customer.name}'s Transactions*\n${tx}`,
      });
    }

    // ── DUE ───────────────────────────────────────────────────────────────────
    if (parsed.command === "due") {
      const customer = await Customer.findOne({
        name: new RegExp(`^${parsed.customerName}$`, "i"),
      });
      if (!customer)
        return res.json({
          success: false,
          message: `❌ "${parsed.customerName}" not found`,
        });
      return res.json({
        success: true,
        message:
          customer.totalDue === 0
            ? `✅ *${customer.name}* has no dues!`
            : `💰 *${customer.name}* owes ₹${customer.totalDue}`,
      });
    }

    // ── PAYMENT ───────────────────────────────────────────────────────────────
    if (parsed.command === "pay") {
      const customer = await Customer.findOne({
        name: new RegExp(`^${parsed.customerName}$`, "i"),
      });
      if (!customer)
        return res.json({
          success: false,
          message: `❌ "${parsed.customerName}" not found`,
        });

      const prevDue = customer.totalDue;
      customer.transactions.push({
        itemName: "Payment Received",
        amount: parsed.amount,
        paid: parsed.amount,
        transactionType: "payment",
        originalMessage: `Payment ₹${parsed.amount} from ${parsed.customerName}`,
        date: new Date(),
      });
      customer.totalPaid += parsed.amount;
      customer.totalAmount += parsed.amount;
      await customer.save();

      return res.json({
        success: true,
        message: `✅ *PAYMENT*\n👤 ${customer.name}\n💵 ₹${parsed.amount}\n📊 Due: ₹${customer.totalDue}`,
      });
    }

    // ── DEFAULT: Normal Transaction (using Gemini parser) ─────────────────────
    const parsedTx = await parseMessage(message);
    const { customerName, itemName, quantity, amount, paid, originalMessage } =
      parsedTx;

    if (!amount) {
      return res.json({
        success: false,
        message: "❌ Could not understand. Try: *Ravi 2 milk 40 rs*",
      });
    }

    let customer = await Customer.findOne({
      name: new RegExp(`^${customerName}$`, "i"),
    });
    const isNew = !customer;

    if (isNew) {
      customer = new Customer({
        name: customerName,
        totalAmount: amount,
        totalPaid: paid || 0,
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
        ? `🆕 *NEW CUSTOMER*: ${customerName}\n🛒 ${quantity} ${itemName} — ₹${amount}\n📊 Due: ₹${customer.totalDue}`
        : `✅ *ADDED*: ${quantity} ${itemName} — ₹${amount}\n📊 ${customerName} Due: ₹${customer.totalDue}`,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

export default router;
