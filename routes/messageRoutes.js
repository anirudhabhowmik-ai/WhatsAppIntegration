import express from "express";
import Customer from "../models/Customer.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function understandIntent(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      Analyze this message and return ONLY valid JSON:
      Message: "${message}"
      
      Return: {"intent": "add_transaction|check_due|payment|list_customers|summary|help", "customerName": "name or null", "amount": number or null, "itemName": "item or null", "quantity": number or null}
      
      Examples:
      "Ravi 2 milk 40" → {"intent": "add_transaction", "customerName": "Ravi", "amount": 40, "itemName": "milk", "quantity": 2}
      "Ravi pending" → {"intent": "check_due", "customerName": "Ravi", "amount": null, "itemName": null, "quantity": null}
      "pay Ravi 20" → {"intent": "payment", "customerName": "Ravi", "amount": 20, "itemName": null, "quantity": null}
      "list" → {"intent": "list_customers"}
      "summary" → {"intent": "summary"}
      "help" → {"intent": "help"}
    `;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    
    return JSON.parse(match ? match[0] : '{"intent":"unknown"}');
  } catch (error) {
    console.error("Intent error:", error.message);
    return { intent: "unknown" };
  }
}

router.post("/", async (req, res) => {
  try {
    const { message, customerPhone, customerName, shopkeeperId = "default" } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, message: "Message required" });
    }
    
    console.log(`📝 Message: ${message}`);
    
    const intent = await understandIntent(message);
    const effectiveName = customerName || intent.customerName;
    
    // HELP
    if (intent.intent === 'help') {
      return res.json({
        success: true,
        message: `📖 COMMANDS:\nAdd: Ravi 2 milk 40\nPay: pay Ravi 20\nDue: Ravi pending\nList: list\nSummary: summary`
      });
    }
    
    // SUMMARY
    if (intent.intent === 'summary') {
      const customers = await Customer.find({ shopkeeperId });
      const totalAmount = customers.reduce((s, c) => s + (c.totalAmount || 0), 0);
      const totalPaid = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDue = customers.reduce((s, c) => s + (c.totalDue || 0), 0);
      
      return res.json({
        success: true,
        message: `📊 SUMMARY\nCustomers: ${customers.length}\nSales: ₹${totalAmount}\nCollected: ₹${totalPaid}\nDue: ₹${totalDue}`
      });
    }
    
    // LIST CUSTOMERS
    if (intent.intent === 'list_customers') {
      const customers = await Customer.find({ shopkeeperId }).sort({ createdAt: -1 });
      if (!customers.length) {
        return res.json({ success: true, message: "No customers yet. Send: Ravi 2 milk 40" });
      }
      const lines = customers.map((c, i) => `${i+1}. ${c.name} - ₹${c.totalDue}`);
      return res.json({ success: true, message: `CUSTOMERS:\n${lines.join("\n")}` });
    }
    
    // CHECK DUE
    if (intent.intent === 'check_due') {
      if (!effectiveName) {
        return res.json({ success: false, message: "Please specify customer name" });
      }
      
      const customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${effectiveName}$`, "i") });
      if (!customer) {
        return res.json({ success: false, message: `Customer "${effectiveName}" not found` });
      }
      
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }
      
      return res.json({ 
        success: true, 
        message: customer.totalDue === 0 ? `✅ ${customer.name} has no dues` : `💰 ${customer.name} owes ₹${customer.totalDue}`
      });
    }
    
    // PAYMENT
    if (intent.intent === 'payment') {
      const amount = intent.amount;
      
      if (!effectiveName || !amount) {
        return res.json({ success: false, message: "Please specify customer and amount. Example: pay Ravi 20" });
      }
      
      let customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${effectiveName}$`, "i") });
      if (!customer) {
        return res.json({ success: false, message: `Customer "${effectiveName}" not found` });
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
        message: `✅ Payment received! ${customer.name} paid ₹${amount}\nPrevious Due: ₹${prevDue}\nNew Due: ₹${customer.totalDue}`
      });
    }
    
    // ADD TRANSACTION
    const { customerName, itemName, quantity, amount, paid } = intent;
    
    if (!amount || amount === 0) {
      return res.json({ success: false, message: "Could not understand. Try: Ravi 2 milk 40" });
    }
    
    let customer = await Customer.findOne({ shopkeeperId, name: new RegExp(`^${customerName}$`, "i") });
    const isNew = !customer;
    
    if (isNew) {
      customer = new Customer({
        shopkeeperId,
        name: customerName,
        phone: customerPhone || null,
        totalAmount: amount,
        totalPaid: paid || 0,
        totalDue: amount - (paid || 0),
        transactions: [{
          itemName: itemName || "item",
          quantity: quantity || 1,
          amount: amount,
          paid: paid || 0,
          transactionType: "debit",
          originalMessage: message,
          date: new Date(),
        }],
      });
    } else {
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
      }
      
      customer.transactions.push({
        itemName: itemName || "item",
        quantity: quantity || 1,
        amount: amount,
        paid: paid || 0,
        transactionType: "debit",
        originalMessage: message,
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
        ? `🆕 New customer: ${customerName}\n${quantity || 1} ${itemName || "item"} - ₹${amount}\nDue: ₹${customer.totalDue}`
        : `✅ Added: ${quantity || 1} ${itemName || "item"} - ₹${amount}\n${customerName} Due: ₹${customer.totalDue}`
    });
    
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, message: "Server Error: " + error.message });
  }
});

export default router;