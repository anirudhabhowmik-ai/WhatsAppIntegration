import express from "express";
import Customer from "../models/Customer.js";
import Transaction from "../models/Transaction.js";

const router = express.Router();

// Parse message helper
const parseMessage = (message) => {
  const words = message.trim().split(/\s+/);
  const customerName = words[0] || "Unknown";
  let quantity = 1;
  let itemName = "";
  let amount = 0;
  
  // Find quantity (first number)
  for (let i = 0; i < words.length; i++) {
    if (!isNaN(words[i]) && words[i].trim() !== "") {
      quantity = parseInt(words[i]);
      break;
    }
  }
  
  // Find amount (last number)
  const numbers = message.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    amount = parseInt(numbers[numbers.length - 1]);
  }
  
  // Extract item name
  const quantityIndex = words.findIndex(w => !isNaN(w));
  if (quantityIndex !== -1 && amount > 0) {
    const amountIndex = message.lastIndexOf(amount.toString());
    const beforeAmount = message.substring(0, amountIndex);
    const afterQuantity = beforeAmount.substring(beforeAmount.indexOf(words[quantityIndex]) + words[quantityIndex].length);
    itemName = afterQuantity.replace(/rs|rupees|₹/gi, '').trim() || "item";
  } else if (quantityIndex !== -1) {
    itemName = words.slice(quantityIndex + 1).join(" ").replace(/rs|rupees|₹/gi, '').trim() || "item";
  }
  
  return { customerName, quantity, itemName, amount, originalMessage: message };
};

// Create transaction
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const { customerName, quantity, itemName, amount, originalMessage } = parseMessage(message);

    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: "Could not extract amount. Use format: 'Ravi 2 milk 40 rs'",
      });
    }

    // Find or create customer (case insensitive)
    let customer = await Customer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, 'i') },
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
        parsedData: { customerName, quantity, itemName, amount },
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

// Get all transactions
router.get("/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 }).limit(100);
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
      name: { $regex: new RegExp(`^${customerName}$`, 'i') },
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
    
    const todayTransactions = transactions.filter(t => new Date(t.createdAt) >= today);
    const todaySales = todayTransactions
      .filter(t => t.itemName !== "Payment Received")
      .reduce((sum, t) => sum + t.amount, 0);
    const todayPayments = todayTransactions
      .filter(t => t.itemName === "Payment Received")
      .reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      success: true,
      summary: {
        totalCustomers: customers.length,
        totalDue: totalDue,
        totalTransactions: transactions.length,
        todaySales: todaySales,
        todayPayments: todayPayments,
        netToday: todaySales - todayPayments,
      }
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