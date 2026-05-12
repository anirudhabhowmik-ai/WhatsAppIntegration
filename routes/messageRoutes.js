import express from "express";
import Customer from "../models/Customer.js";
import Transaction from "../models/Transaction.js";
import parseMessage from "../services/parserService.js"; // Import Gemini parser

const router = express.Router();

// Create transaction - NOW USING GEMINI AI
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Using Gemini AI parser (async)
    const parsedData = await parseMessage(message);
    const { customerName, quantity, itemName, itemDescription, amount, originalMessage } =
      parsedData;

    console.log("📝 Gemini Parsed:", {
      customerName,
      quantity,
      itemName,
      itemDescription,
      amount,
    });

    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: "Could not extract amount. Use format: 'Ravi 2 milk 40 rs'",
        example: "Ravi 2 milk 40 rs",
      });
    }

    // Find or create customer (case insensitive)
    let customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, "i") },
    });

    let isNewCustomer = false;

    if (!customer) {
      customer = await Customer.create({
        name: customerName,
        totalDue: amount,
      });
      isNewCustomer = true;
    } else {
      customer.totalDue += amount;
      await customer.save();
    }

    // Save transaction
    const transaction = await Transaction.create({
      customerName: customer.name,
      quantity: quantity,
      itemName: itemName,
      amount: amount,
      originalMessage: originalMessage,
      transactionType: "debit",
    });

    const replyMessage = isNewCustomer
      ? `✅ NEW CUSTOMER CREATED!\n\n👤 Name: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n📊 Total Due: ₹${customer.totalDue}`
      : `✅ ACCOUNT UPDATED!\n\n👤 Customer: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n📊 New Total Due: ₹${customer.totalDue}`;

    res.status(201).json({
      success: true,
      message: replyMessage,
      data: {
        isNewCustomer,
        parsedData: { customerName, itemName, itemDescription, quantity, amount, totalDue },
        customer: {
          id: customer._id,
          name: customer.name,
          totalDue: customer.totalDue,
        },
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          item: transaction.itemName,
          quantity: transaction.quantity,
        },
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Get all customers
router.get("/customers", async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    const totalDue = customers.reduce((sum, c) => sum + c.totalDue, 0);

    res.json({
      success: true,
      count: customers.length,
      totalDue: totalDue,
      customers: customers,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Get single customer with transactions
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const transactions = await Transaction.find({
      customerName: { $regex: new RegExp(`^${customer.name}$`, "i") },
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      customer: customer,
      transactions: transactions,
      totalTransactions: transactions.length,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Get all transactions
router.get("/transactions", async (req, res) => {
  try {
    const { limit = 100, customer } = req.query;

    let query = {};
    if (customer) {
      query.customerName = { $regex: new RegExp(`^${customer}$`, "i") };
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      count: transactions.length,
      totalAmount: totalAmount,
      transactions: transactions,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Record payment
router.post("/payment", async (req, res) => {
  try {
    const { customerName, amount, note } = req.body;

    if (!customerName || !amount) {
      return res.status(400).json({
        success: false,
        message: "Customer name and amount are required",
      });
    }

    const customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, "i") },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer "${customerName}" not found`,
      });
    }

    const oldDue = customer.totalDue;
    customer.totalDue = Math.max(0, customer.totalDue - amount);
    await customer.save();

    const transaction = await Transaction.create({
      customerName: customer.name,
      quantity: 1,
      itemName: "Payment Received",
      amount: amount,
      originalMessage: `Payment of ₹${amount} from ${customerName}. ${note || ""}`,
      transactionType: "credit",
    });

    res.json({
      success: true,
      message: `✅ Payment received from ${customerName}\n💰 Amount: ₹${amount}\n📊 Previous Due: ₹${oldDue}\n📊 New Due: ₹${customer.totalDue}`,
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          totalDue: customer.totalDue,
        },
        transaction: transaction,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Get dashboard summary
router.get("/summary", async (req, res) => {
  try {
    const customers = await Customer.find();
    const transactions = await Transaction.find();

    const totalDue = customers.reduce((sum, c) => sum + c.totalDue, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = transactions.filter(
      (t) => new Date(t.createdAt) >= today,
    );
    const todaySales = todayTransactions
      .filter((t) => t.itemName !== "Payment Received")
      .reduce((sum, t) => sum + t.amount, 0);
    const todayPayments = todayTransactions
      .filter((t) => t.itemName === "Payment Received")
      .reduce((sum, t) => sum + t.amount, 0);

    // Get top 5 customers by due
    const topCustomers = [...customers]
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 5)
      .map((c) => ({
        id: c._id,
        name: c.name,
        totalDue: c.totalDue,
      }));

    res.json({
      success: true,
      summary: {
        totalCustomers: customers.length,
        totalDue: totalDue,
        totalTransactions: transactions.length,
        todaySales: todaySales,
        todayPayments: todayPayments,
        netToday: todaySales - todayPayments,
        topCustomers: topCustomers,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Delete transaction (undo)
router.delete("/transaction/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Find and update customer
    const customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${transaction.customerName}$`, "i") },
    });

    if (customer) {
      if (transaction.transactionType === "debit") {
        customer.totalDue -= transaction.amount;
      } else {
        customer.totalDue += transaction.amount;
      }
      await customer.save();
    }

    await Transaction.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

export default router;
