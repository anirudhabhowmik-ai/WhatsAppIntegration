import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Fallback: pure regex/string parser ────────────────────────────────────────
const fallbackParseMessage = (message) => {
  console.log("⚠️  Using fallback parser for:", message);

  const words = message.trim().split(/\s+/);
  const customerName = words[0] || "Unknown";

  // phone: 10-digit run
  const phoneMatch = message.match(/\b\d{10}\b/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // all numbers in message (excluding the phone)
  const clean = phone ? message.replace(phone, "") : message;
  const numbers = (clean.match(/\d+/g) || []).map(Number);

  const quantity = numbers.length >= 2 ? numbers[0] : 1;
  const amount   = numbers.length >= 1 ? numbers[numbers.length - 1] : 0;

  // item = words between quantity-word and amount-word
  let itemName = "item";
  if (numbers.length >= 2) {
    const qIdx = words.findIndex((w) => parseInt(w) === quantity);
    const rest  = words.slice(qIdx + 1).join(" ");
    itemName = rest.replace(new RegExp(`${amount}\\s*(rs|rupees|₹)?`, "i"), "").trim() || "item";
  }

  // paid: look for "paid X" pattern
  const paidMatch = message.match(/paid\s+(\d+)/i);
  const paid = paidMatch ? parseInt(paidMatch[1]) : 0;

  return {
    customerName,
    phone,
    itemName,
    itemDescription: itemName,
    quantity,
    amount,
    paid,
    totalDue: amount - paid,
    originalMessage: message,
  };
};

// ── Gemini parser ─────────────────────────────────────────────────────────────
const parseMessage = async (message) => {
  // Special commands: "list", "due <name>", "pay <name> <amount>"
  const lower = message.trim().toLowerCase();

  if (lower === "list") return { command: "list" };

  const dueMatch = message.match(/^due\s+(.+)$/i);
  if (dueMatch) return { command: "due", customerName: dueMatch[1].trim() };

  const payMatch = message.match(/^pay\s+(\S+)\s+(\d+)/i);
  if (payMatch) return { command: "pay", customerName: payMatch[1], amount: parseInt(payMatch[2]) };

  // Normal transaction — parse with Gemini
  try {
    console.log("🤖 Parsing with Gemini:", message);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a shopkeeper assistant. Parse the message and return ONLY valid JSON, no extra text.

Message: "${message}"

JSON format:
{
  "customerName": "first word / person name",
  "phone": "10-digit number if present, else empty string",
  "itemName": "product name",
  "itemDescription": "2-3 word description",
  "quantity": <number>,
  "amount": <total price in rupees, integer>,
  "paid": <amount paid if mentioned, else 0>,
  "totalDue": <amount - paid>
}

Examples:
"Ravi 2 milk 40 rs" → {"customerName":"Ravi","phone":"","itemName":"milk","itemDescription":"fresh milk","quantity":2,"amount":40,"paid":0,"totalDue":40}
"Suresh 9876543210 1kg rice 60 rs" → {"customerName":"Suresh","phone":"9876543210","itemName":"rice","itemDescription":"basmati rice","quantity":1,"amount":60,"paid":0,"totalDue":60}
"Amit 2 bread 50 paid 20" → {"customerName":"Amit","phone":"","itemName":"bread","itemDescription":"white bread","quantity":2,"amount":50,"paid":20,"totalDue":30}
`;

    const result   = await model.generateContent(prompt);
    const text     = result.response.text();
    const cleaned  = (text.match(/\{[\s\S]*\}/) || ["{}"])[0];
    const parsed   = JSON.parse(cleaned);

    console.log("✅ Gemini parsed:", parsed);

    return {
      customerName:    parsed.customerName    || "Unknown",
      phone:           parsed.phone           || "",
      itemName:        parsed.itemName        || "item",
      itemDescription: parsed.itemDescription || parsed.itemName || "item",
      quantity:        parsed.quantity        || 1,
      amount:          parsed.amount          || 0,
      paid:            parsed.paid            || 0,
      totalDue:        (parsed.amount || 0) - (parsed.paid || 0),
      originalMessage: message,
    };
  } catch (err) {
    console.error("❌ Gemini error:", err.message);
    return fallbackParseMessage(message);
  }
};

export default parseMessage;