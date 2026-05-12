import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// Create transaction - Store directly in customer (NO separate Transaction model)
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Using Gemini AI parser
    const parsedData = await parseMessage(message);
    const {
      customerName,
      phone,
      itemName,
      itemDescription,
      quantity,
      amount,
      paid,
      originalMessage,
    } = parsedData;

    console.log("📝 Gemini Parsed:", {
      customerName,
      quantity,
      itemName,
      amount,
      paid,
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
      // Create new customer with first transaction embedded
      customer = new Customer({
        name: customerName,
        phone: phone || "",
        totalAmount: amount,
        totalPaid: paid || 0,
        totalDue: amount - (paid || 0),
        transactions: [
          {
            itemName: itemName,
            itemDescription: itemDescription || "",
            quantity: quantity,
            amount: amount,
            paid: paid || 0,
            transactionType: "debit",
            originalMessage: originalMessage,
            date: new Date(),
          },
        ],
      });
      isNewCustomer = true;
    } else {
      // Add transaction to existing customer's embedded transactions array
      customer.transactions.push({
        itemName: itemName,
        itemDescription: itemDescription || "",
        quantity: quantity,
        amount: amount,
        paid: paid || 0,
        transactionType: "debit",
        originalMessage: originalMessage,
        date: new Date(),
      });

      // Update totals
      customer.totalAmount += amount;
      customer.totalPaid += paid || 0;
      customer.totalDue = customer.totalAmount - customer.totalPaid;
    }

    await customer.save();

    const replyMessage = isNewCustomer
      ? `✅ NEW CUSTOMER CREATED!\n\n👤 Name: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n💰 Paid: ₹${paid || 0}\n📊 Total Due: ₹${customer.totalDue}`
      : `✅ ACCOUNT UPDATED!\n\n👤 Customer: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n💰 Paid: ₹${paid || 0}\n📊 New Total Due: ₹${customer.totalDue}`;

    res.status(201).json({
      success: true,
      message: replyMessage,
      data: {
        isNewCustomer,
        customer: {
          id: customer._id,
          name: customer.name,
          phone: customer.phone,
          totalAmount: customer.totalAmount,
          totalPaid: customer.totalPaid,
          totalDue: customer.totalDue,
          transactionsCount: customer.transactions.length,
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
    const totalDue = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);
    const totalAmount = customers.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    );
    const totalPaid = customers.reduce((sum, c) => sum + (c.totalPaid || 0), 0);

    res.json({
      success: true,
      count: customers.length,
      totalAmount: totalAmount,
      totalPaid: totalPaid,
      totalDue: totalDue,
      customers: customers.map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        totalAmount: c.totalAmount || 0,
        totalPaid: c.totalPaid || 0,
        totalDue: c.totalDue || 0,
        transactionsCount: c.transactions?.length || 0,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Get single customer with all transactions
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.json({
      success: true,
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        totalAmount: customer.totalAmount || 0,
        totalPaid: customer.totalPaid || 0,
        totalDue: customer.totalDue || 0,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      transactions: customer.transactions
        ? [...customer.transactions].sort(
            (a, b) => new Date(b.date) - new Date(a.date),
          )
        : [],
      totalTransactions: customer.transactions?.length || 0,
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

    const paymentAmount = parseInt(amount);
    if (isNaN(paymentAmount)) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
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

    const previousDue = customer.totalDue || 0;

    // Add payment transaction to embedded transactions array
    customer.transactions.push({
      itemName: "Payment Received",
      amount: paymentAmount,
      paid: paymentAmount,
      transactionType: "payment",
      originalMessage: `Payment of ₹${paymentAmount} from ${customerName}. ${note || ""}`,
      date: new Date(),
    });

    // Update totals
    customer.totalPaid = (customer.totalPaid || 0) + paymentAmount;
    customer.totalDue = (customer.totalAmount || 0) - (customer.totalPaid || 0);

    await customer.save();

    res.json({
      success: true,
      message: `✅ Payment received from ${customerName}\n💰 Amount: ₹${paymentAmount}\n📊 Previous Due: ₹${previousDue}\n📊 New Due: ₹${customer.totalDue}`,
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          totalAmount: customer.totalAmount || 0,
          totalPaid: customer.totalPaid || 0,
          totalDue: customer.totalDue || 0,
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

// Get dashboard summary
router.get("/summary", async (req, res) => {
  try {
    const customers = await Customer.find();

    const totalAmount = customers.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    );
    const totalPaid = customers.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
    const totalDue = customers.reduce((sum, c) => sum + (c.totalDue || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todaySales = 0;
    let todayPayments = 0;

    customers.forEach((customer) => {
      if (customer.transactions) {
        customer.transactions.forEach((transaction) => {
          if (transaction.date && new Date(transaction.date) >= today) {
            if (transaction.transactionType === "debit") {
              todaySales += transaction.amount || 0;
            } else if (transaction.transactionType === "payment") {
              todayPayments += transaction.amount || 0;
            }
          }
        });
      }
    });

    const topCustomers = [...customers]
      .sort((a, b) => (b.totalDue || 0) - (a.totalDue || 0))
      .slice(0, 5)
      .map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        totalDue: c.totalDue || 0,
        totalAmount: c.totalAmount || 0,
        totalPaid: c.totalPaid || 0,
      }));

    res.json({
      success: true,
      summary: {
        totalCustomers: customers.length,
        totalAmount: totalAmount,
        totalPaid: totalPaid,
        totalDue: totalDue,
        totalTransactions: customers.reduce(
          (sum, c) => sum + (c.transactions?.length || 0),
          0,
        ),
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

export default router;
