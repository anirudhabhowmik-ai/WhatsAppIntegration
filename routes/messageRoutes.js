import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// ── POST /message/  — main entry point for all chat messages ─────────────────
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    const parsed = await parseMessage(message);

    // ── Command: list ─────────────────────────────────────────────────────────
    if (parsed.command === "list") {
      const customers = await Customer.find().sort({ createdAt: -1 });
      if (!customers.length) {
        return res.json({
          success: true,
          message: "📭 No customers yet. Add one like:\n  *Ravi 2 milk 40 rs*",
        });
      }
      const lines = customers.map(
        (c, i) => `${i + 1}. *${c.name}* — Due: ₹${c.totalDue}`,
      );
      return res.json({
        success: true,
        message:
          `👥 *Customer List* (${customers.length})\n\n` + lines.join("\n"),
      });
    }

    // ── Command: due <name> ───────────────────────────────────────────────────
    if (parsed.command === "due") {
      const customer = await Customer.findOne({
        name: { $regex: new RegExp(`^${parsed.customerName}$`, "i") },
      });
      if (!customer) {
        return res
          .status(404)
          .json({
            success: false,
            message: `❌ Customer "${parsed.customerName}" not found`,
          });
      }
      const recentTx = customer.transactions
        .slice(-3)
        .reverse()
        .map((t) => `  • ${t.itemName} ×${t.quantity} — ₹${t.amount}`)
        .join("\n");

      return res.json({
        success: true,
        message:
          `👤 *${customer.name}*\n` +
          `💰 Total: ₹${customer.totalAmount}\n` +
          `✅ Paid:  ₹${customer.totalPaid}\n` +
          `📊 Due:   ₹${customer.totalDue}\n\n` +
          `🧾 Recent:\n${recentTx || "  (none)"}`,
      });
    }

    // ── Command: pay <name> <amount> ──────────────────────────────────────────
    if (parsed.command === "pay") {
      const customer = await Customer.findOne({
        name: { $regex: new RegExp(`^${parsed.customerName}$`, "i") },
      });
      if (!customer) {
        return res
          .status(404)
          .json({
            success: false,
            message: `❌ Customer "${parsed.customerName}" not found`,
          });
      }

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
      customer.totalAmount += parsed.amount; // keep accounting balanced
      await customer.save();

      return res.json({
        success: true,
        message:
          `✅ *Payment Received!*\n\n` +
          `👤 ${customer.name}\n` +
          `💵 Paid: ₹${parsed.amount}\n` +
          `📊 Previous Due: ₹${prevDue}\n` +
          `📊 New Due: ₹${customer.totalDue}`,
      });
    }

    // ── Normal transaction ────────────────────────────────────────────────────
    const {
      customerName,
      phone,
      itemName,
      itemDescription,
      quantity,
      amount,
      paid,
      originalMessage,
    } = parsed;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "❌ Could not read amount.\nTry: *Ravi 2 milk 40 rs*",
      });
    }

    let customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, "i") },
    });
    const isNew = !customer;

    if (isNew) {
      customer = new Customer({
        name: customerName,
        phone: phone || "",
        totalAmount: amount,
        totalPaid: paid || 0,
        transactions: [
          {
            itemName,
            itemDescription: itemDescription || "",
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
        itemDescription: itemDescription || "",
        quantity,
        amount,
        paid: paid || 0,
        transactionType: "debit",
        originalMessage,
        date: new Date(),
      });
      customer.totalAmount += amount;
      customer.totalPaid += paid || 0;
    }

    await customer.save();

    return res.status(201).json({
      success: true,
      message:
        (isNew ? `🆕 *New Customer Added!*\n\n` : `✅ *Entry Added!*\n\n`) +
        `👤 ${customerName}\n` +
        `🛒 ${quantity} ${itemName} — ₹${amount}\n` +
        (paid ? `✅ Paid: ₹${paid}\n` : "") +
        `📊 Total Due: ₹${customer.totalDue}`,
      data: {
        isNew,
        customer: {
          id: customer._id,
          name: customer.name,
          totalAmount: customer.totalAmount,
          totalPaid: customer.totalPaid,
          totalDue: customer.totalDue,
        },
      },
    });
  } catch (error) {
    console.error("❌ Route error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

// ── GET /message/customers ────────────────────────────────────────────────────
router.get("/customers", async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);
    res.json({
      success: true,
      count: customers.length,
      totalDue,
      customers: customers.map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        totalAmount: c.totalAmount,
        totalPaid: c.totalPaid,
        totalDue: c.totalDue,
        transactionsCount: c.transactions?.length || 0,
      })),
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

// ── GET /message/customers/:id ────────────────────────────────────────────────
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });

    res.json({
      success: true,
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        totalAmount: customer.totalAmount,
        totalPaid: customer.totalPaid,
        totalDue: customer.totalDue,
      },
      transactions:
        customer.transactions?.sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        ) || [],
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

// ── POST /message/payment ─────────────────────────────────────────────────────
router.post("/payment", async (req, res) => {
  try {
    const { customerName, amount, note } = req.body;
    if (!customerName || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Customer name and amount required" });
    }
    const payAmt = parseInt(amount);
    if (isNaN(payAmt))
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });

    const customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, "i") },
    });
    if (!customer)
      return res
        .status(404)
        .json({ success: false, message: `"${customerName}" not found` });

    const prevDue = customer.totalDue;
    customer.transactions.push({
      itemName: "Payment Received",
      amount: payAmt,
      paid: payAmt,
      transactionType: "payment",
      originalMessage: `Payment ₹${payAmt} from ${customerName}. ${note || ""}`,
      date: new Date(),
    });
    customer.totalPaid += payAmt;
    customer.totalAmount += payAmt;
    await customer.save();

    res.json({
      success: true,
      message:
        `✅ Payment from ${customerName}\n` +
        `💰 ₹${payAmt} received\n` +
        `📊 Previous Due: ₹${prevDue}\n` +
        `📊 New Due: ₹${customer.totalDue}`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

// ── GET /message/summary ──────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const customers = await Customer.find();
    const totalAmount = customers.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
    const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let todaySales = 0,
      todayPayments = 0;
    customers.forEach((c) => {
      c.transactions?.forEach((t) => {
        if (t.date && new Date(t.date) >= today) {
          if (t.transactionType === "debit") todaySales += t.amount || 0;
          if (t.transactionType === "payment") todayPayments += t.amount || 0;
        }
      });
    });

    res.json({
      success: true,
      summary: {
        totalCustomers: customers.length,
        totalAmount,
        totalPaid,
        totalDue,
        totalTransactions: customers.reduce(
          (s, c) => s + (c.transactions?.length || 0),
          0,
        ),
        todaySales,
        todayPayments,
        netToday: todaySales - todayPayments,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error: " + error.message });
  }
});

export default router;