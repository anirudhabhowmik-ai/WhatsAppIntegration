import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";

const router = express.Router();

// Create transaction - Store directly in customer
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
      // Create new customer with first transaction
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
      // Add transaction to existing customer
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
      ? `✅ NEW CUSTOMER CREATED!\n\n👤 Name: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n📊 Total Due: ₹${customer.totalDue}`
      : `✅ ACCOUNT UPDATED!\n\n👤 Customer: ${customerName}\n📝 Purchase: ${quantity} ${itemName}\n💰 Amount: ₹${amount}\n📊 New Total Due: ₹${customer.totalDue}`;

    res.status(201).json({
      success: true,
      message: replyMessage,
      data: {
        isNewCustomer,
        parsedData: {
          customerName,
          phone,
          itemName,
          itemDescription,
          quantity,
          amount,
          paid,
        },
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
    const totalDue = customers.reduce((sum, c) => sum + c.totalDue, 0);
    const totalAmount = customers.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = customers.reduce((sum, c) => sum + c.totalPaid, 0);

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
        totalAmount: c.totalAmount,
        totalPaid: c.totalPaid,
        totalDue: c.totalDue,
        transactionsCount: c.transactions.length,
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
        totalAmount: customer.totalAmount,
        totalPaid: customer.totalPaid,
        totalDue: customer.totalDue,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      transactions: customer.transactions.sort((a, b) => b.date - a.date),
      totalTransactions: customer.transactions.length,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: " + error.message,
    });
  }
});

// Record payment (add payment transaction to customer)
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

    // Add payment transaction
    customer.transactions.push({
      itemName: "Payment Received",
      amount: amount,
      paid: amount,
      transactionType: "payment",
      originalMessage: `Payment of ₹${amount} from ${customerName}. ${note || ""}`,
      date: new Date(),
    });

    // Update totals
    customer.totalPaid += amount;
    customer.totalDue = customer.totalAmount - customer.totalPaid;

    await customer.save();

    res.json({
      success: true,
      message: `✅ Payment received from ${customerName}\n💰 Amount: ₹${amount}\n📊 Previous Due: ₹${customer.totalDue + amount}\n📊 New Due: ₹${customer.totalDue}`,
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          totalAmount: customer.totalAmount,
          totalPaid: customer.totalPaid,
          totalDue: customer.totalDue,
        },
        lastPayment: customer.transactions[customer.transactions.length - 1],
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

    const totalAmount = customers.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPaid = customers.reduce((sum, c) => sum + c.totalPaid, 0);
    const totalDue = customers.reduce((sum, c) => sum + c.totalDue, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate today's sales and payments from transactions
    let todaySales = 0;
    let todayPayments = 0;

    customers.forEach((customer) => {
      customer.transactions.forEach((transaction) => {
        if (new Date(transaction.date) >= today) {
          if (transaction.transactionType === "debit") {
            todaySales += transaction.amount;
          } else if (transaction.transactionType === "payment") {
            todayPayments += transaction.amount;
          }
        }
      });
    });

    // Get top 5 customers by due
    const topCustomers = [...customers]
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 5)
      .map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        totalDue: c.totalDue,
        totalAmount: c.totalAmount,
        totalPaid: c.totalPaid,
      }));

    res.json({
      success: true,
      summary: {
        totalCustomers: customers.length,
        totalAmount: totalAmount,
        totalPaid: totalPaid,
        totalDue: totalDue,
        totalTransactions: customers.reduce(
          (sum, c) => sum + c.transactions.length,
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

// Delete transaction (undo) - remove from customer's transactions array
router.delete(
  "/transaction/:customerId/:transactionIndex",
  async (req, res) => {
    try {
      const { customerId, transactionIndex } = req.params;

      const customer = await Customer.findById(customerId);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      const index = parseInt(transactionIndex);
      if (index < 0 || index >= customer.transactions.length) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const transaction = customer.transactions[index];

      // Reverse the transaction effects
      if (transaction.transactionType === "debit") {
        customer.totalAmount -= transaction.amount;
        customer.totalPaid -= transaction.paid || 0;
      } else if (transaction.transactionType === "payment") {
        customer.totalPaid -= transaction.amount;
      }

      customer.totalDue = customer.totalAmount - customer.totalPaid;

      // Remove the transaction
      customer.transactions.splice(index, 1);

      await customer.save();

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
  },
);

export default router;
