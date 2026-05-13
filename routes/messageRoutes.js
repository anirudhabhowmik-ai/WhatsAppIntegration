import express from "express";
import Customer from "../models/Customer.js";
import parseMessage from "../services/parserService.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI-powered intent recognition - Works for ANY language
async function understandIntent(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are a multilingual shopkeeper assistant. Analyze the user's message in ANY language and classify the intent.
      
      Message: "${message}"
      
      Detect the language automatically (English, Hindi, Marathi, Telugu, Tamil, Gujarati, Bengali, Urdu, etc.)
      
      Return ONLY valid JSON in this exact format (no other text):
      {
        "intent": "add_transaction | check_due | payment | list_customers | customer_details | transaction_history | delete_customer | summary | help",
        "customerName": "extracted customer name or null",
        "amount": number or null,
        "itemName": "item name or null", 
        "quantity": number or null,
        "language": "detected language code"
      }
      
      UNDERSTAND THESE INTENTS IN ANY LANGUAGE:
      
      1. add_transaction - User wants to RECORD a purchase
         Examples in different languages:
         - English: "Ravi 2 milk 40 rs", "Ravi bought 2 milk for 40"
         - Hindi: "Ravi 2 doodh 40 rupaye", "Ravi ne 2 doodh liya 40 mein"
         - Marathi: "Ravi 2 doodh 40 rupaye", "Ravi la 2 doodh 40 la"
         - Telugu: "Ravi 2 milk 40 rupayalu", "Ravi 2 milk konnadu 40 ki"
         Format: [NAME] [QUANTITY] [ITEM] [AMOUNT]
      
      2. check_due - User wants to KNOW how much is PENDING/BAKI
         Examples:
         - English: "Ravi pending", "Ravi balance", "How much Ravi owes"
         - Hindi: "Ravi baki", "Ravi ka kitna baki hai", "Ravi ka pending"
         - Marathi: "Ravi chi baki kiti", "Ravi la kitna dyayche"
         - Telugu: "Ravi ki entha baki undi"
         Keywords: pending, baki, due, balance, owe, kitna, entha, kiti
      
      3. payment - User wants to RECORD a PAYMENT received
         Examples:
         - English: "pay Ravi 20", "Ravi paid 20", "received 20 from Ravi"
         - Hindi: "Ravi ko 20 de diye", "Ravi ne 20 diye", "Ravi se 20 mile"
         - Marathi: "Ravi la 20 dile", "Ravi ne 20 diye"
         - Telugu: "Ravi ki 20 ichanu", "Ravi nunchi 20 vachindi"
         Pattern: [NAME] [AMOUNT] [payment keywords]
      
      4. list_customers - User wants to SEE ALL customers
         Examples:
         - English: "list all customers", "show customers", "all customers"
         - Hindi: "sab customers dikhao", "customer list", "sabhi customer"
         - Marathi: "sarv customer dikhva", "customer list"
         - Telugu: "andaru customers chupu", "customer list"
      
      5. customer_details - User wants DETAILS of a specific customer
         Examples:
         - English: "Ravi details", "show Ravi info", "tell me about Ravi"
         - Hindi: "Ravi ka details", "Ravi ki jaankari", "Ravi ka info"
         - Marathi: "Ravi chi mahiti", "Ravi detail"
         - Telugu: "Ravi details chupu", "Ravi gurinchi cheppu"
      
      6. transaction_history - User wants TRANSACTION HISTORY of a customer
         Examples:
         - English: "Ravi transactions", "Ravi history", "what Ravi bought"
         - Hindi: "Ravi ki transactions", "Ravi ka history", "Ravi ne kya khareeda"
         - Marathi: "Ravi chi transactions", "Ravi cha history"
         - Telugu: "Ravi transactions chupu", "Ravi charitra"
      
      7. delete_customer - User wants to REMOVE/DELETE a customer
         Examples:
         - English: "delete Ravi", "remove Ravi", "Ravi delete karo"
         - Hindi: "Ravi ko hatao", "Ravi delete karo", "Ravi mitao", "Ravi uda do"
         - Marathi: "Ravi la kadhun tak", "Ravi delete kar"
         - Telugu: "Ravi ni delete cheyu", "Ravi ni theeseyi"
         - Urdu: "Ravi ko hatayein", "Ravi ko delete karein"
         Keywords: delete, remove, hatao, mitao, uda do, khatam karo, hatayein
      
      8. summary - User wants OVERALL shop statistics
         Examples:
         - English: "summary", "total sales", "shop stats", "report"
         - Hindi: "summary", "total kitna hua", "shop ka hisaab", "report"
         - Marathi: "sara hisab", "ekun kiti", "summary"
         - Telugu: "mottam lekka", "summary"
      
      9. help - User needs HELP with commands
         Examples: "help", "kaise use karein", "commands", "madad"
      
      IMPORTANT: 
      - Extract customerName (name person)
      - Extract amount (numbers)
      - Extract itemName (product name)
      - Extract quantity (numbers before item)
      
      Return ONLY valid JSON, no explanation.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    const intent = JSON.parse(cleanedText);
    console.log(`🤖 Intent (${intent.language || "auto"}):`, intent);

    return intent;
  } catch (error) {
    console.error("Intent recognition error:", error.message);
    return { intent: "unknown", customerName: null, amount: null };
  }
}

// ── MAIN ENDPOINT ── Handles EVERYTHING with AI ──────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { message, customerPhone, customerName: providedName } = req.body;
    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    // Use AI to understand intent in ANY language
    const intent = await understandIntent(message);

    // Use provided name (from WhatsApp) or extracted name
    const effectiveCustomerName = providedName || intent.customerName;

    // ── HELP ──────────────────────────────────────────────────────────────────
    if (intent.intent === "help") {
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

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    if (intent.intent === "summary") {
      const customers = await Customer.find();
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

    // ── LIST CUSTOMERS ────────────────────────────────────────────────────────
    if (intent.intent === "list_customers") {
      const customers = await Customer.find().sort({ createdAt: -1 });
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

    // ── DELETE CUSTOMER (Any language) ────────────────────────────────────────
    if (intent.intent === "delete_customer") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name to delete.",
        });
      }

      const customer = await Customer.findOne({
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
        });
      }

      await Customer.findByIdAndDelete(customer._id);
      return res.json({
        success: true,
        message: `🗑️ Deleted: *${customer.name}*`,
      });
    }

    // ── CHECK DUE (Any language) ──────────────────────────────────────────────
    if (intent.intent === "check_due") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
        });
      }

      // Update phone if provided
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

    // ── CUSTOMER DETAILS (Any language) ───────────────────────────────────────
    if (intent.intent === "customer_details") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
        });
      }

      // Update phone if provided
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
      }

      return res.json({
        success: true,
        message: `👤 *${customer.name}*\n📱 Phone: ${customer.phone || "N/A"}\n💰 Total: ₹${customer.totalAmount}\n✅ Paid: ₹${customer.totalPaid}\n🔴 Due: ₹${customer.totalDue}\n📝 Transactions: ${customer.transactions?.length || 0}`,
      });
    }

    // ── TRANSACTION HISTORY (Any language) ────────────────────────────────────
    if (intent.intent === "transaction_history") {
      const customerName = effectiveCustomerName;
      if (!customerName) {
        return res.json({
          success: false,
          message: "❌ Please specify customer name.",
        });
      }

      const customer = await Customer.findOne({
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
        });
      }

      // Update phone if provided
      if (customerPhone && !customer.phone) {
        customer.phone = customerPhone;
        await customer.save();
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

    // ── PAYMENT (Any language) ────────────────────────────────────────────────
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
        name: new RegExp(`^${customerName}$`, "i"),
      });
      if (!customer) {
        return res.json({
          success: false,
          message: `❌ Customer "${customerName}" not found.`,
        });
      }

      // Update phone if provided
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

    // ── DEFAULT: Add Transaction (using existing parseMessage with AI) ─────────
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
      name: new RegExp(`^${customerName}$`, "i"),
    });
    const isNew = !customer;

    if (isNew) {
      customer = new Customer({
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
      // Update phone if provided and not already set
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
