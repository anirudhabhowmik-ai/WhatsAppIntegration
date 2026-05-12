import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fallback parser for when Gemini fails
const fallbackParseMessage = (message) => {
  console.log("⚠️ Using fallback parser for:", message);

  const words = message.trim().split(/\s+/);
  let customerName = words[0] || "Unknown";
  let quantity = 1;
  let itemName = "";
  let itemDescription = "";
  let amount = 0;
  let paid = 0;
  let phone = "";

  // Try to extract phone number (10 digits)
  const phoneMatch = message.match(/\b\d{10}\b/);
  if (phoneMatch) {
    phone = phoneMatch[0];
  }

  // Find quantity (first number found)
  let quantityIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (!isNaN(words[i]) && words[i].trim() !== "") {
      quantity = parseInt(words[i]);
      quantityIndex = i;
      break;
    }
  }

  // Find amount (last number in message)
  const numbers = message.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    amount = parseInt(numbers[numbers.length - 1]);
  }

  // Extract item name
  if (quantityIndex !== -1) {
    if (amount > 0 && numbers && numbers.length >= 2) {
      const lastNumberIndex = message.lastIndexOf(
        numbers[numbers.length - 1].toString(),
      );
      const beforeAmount = message.substring(0, lastNumberIndex).trim();
      const afterQuantity = beforeAmount.substring(
        beforeAmount.indexOf(words[quantityIndex]) +
          words[quantityIndex].length,
      );
      itemName = afterQuantity.trim();
    } else {
      itemName = words.slice(quantityIndex + 1).join(" ");
      itemName = itemName.replace(/rs|rupees|₹/gi, "").trim();
    }
  }

  // Simple item description (same as item name for fallback)
  itemDescription = itemName;

  // Calculate total due
  const totalDue = amount - paid;

  return {
    customerName: customerName || "Unknown",
    phone: phone,
    itemName: itemName || "item",
    itemDescription: itemDescription,
    quantity: quantity || 1,
    amount: amount || 0,
    paid: paid,
    totalDue: totalDue,
    originalMessage: message,
  };
};

// Main Gemini parser
const parseMessage = async (message) => {
  try {
    console.log("🤖 Parsing with Gemini:", message);

    // Use gemini-1.5-flash (available in free tier)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      You are a shopkeeper assistant. Parse the following message and extract customer and purchase details.
      
      Message: "${message}"
      
      Return ONLY valid JSON in this exact format (no other text):
      {
        "customerName": "customer name here",
        "phone": "10 digit phone number if present, otherwise empty string",
        "itemName": "product name",
        "itemDescription": "brief description of the item (2-3 words)",
        "quantity": number,
        "amount": number (total price in rupees),
        "paid": number (amount paid if mentioned, otherwise 0),
        "totalDue": number (amount - paid)
      }
      
      Rules:
      - customerName is usually the first word
      - quantity is usually a number before the item
      - amount is usually the last number with "rs" or "rupees"
      - If phone number (10 digits) is present, extract it
      - If no phone number, use empty string ""
      - If no paid amount mentioned, set paid to 0
      - totalDue = amount - paid
      
      Examples:
      "Ravi 2 milk 40 rs" → {"customerName":"Ravi","phone":"","itemName":"milk","itemDescription":"fresh milk","quantity":2,"amount":40,"paid":0,"totalDue":40}
      "John bread 25 rupees paid 10" → {"customerName":"John","phone":"","itemName":"bread","itemDescription":"brown bread","quantity":1,"amount":25,"paid":10,"totalDue":15}
      "Priya 3 coffee 150 paid full" → {"customerName":"Priya","phone":"","itemName":"coffee","itemDescription":"hot coffee","quantity":3,"amount":150,"paid":150,"totalDue":0}
      "Suresh 9876543210 1kg rice 60 rs" → {"customerName":"Suresh","phone":"9876543210","itemName":"rice","itemDescription":"basmati rice","quantity":1,"amount":60,"paid":0,"totalDue":60}
      "Amit 2 bread 50 paid 20 remaining 30" → {"customerName":"Amit","phone":"","itemName":"bread","itemDescription":"white bread","quantity":2,"amount":50,"paid":20,"totalDue":30}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean and parse JSON
    let cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    const parsedData = JSON.parse(cleanedText);

    console.log("✅ Gemini parsed:", parsedData);

    // Ensure all fields have valid values
    return {
      customerName: parsedData.customerName || "Unknown",
      phone: parsedData.phone || "",
      itemName: parsedData.itemName || "item",
      itemDescription:
        parsedData.itemDescription || parsedData.itemName || "item",
      quantity: parsedData.quantity || 1,
      amount: parsedData.amount || 0,
      paid: parsedData.paid || 0,
      totalDue: (parsedData.amount || 0) - (parsedData.paid || 0),
      originalMessage: message,
    };
  } catch (error) {
    console.error("❌ Gemini error:", error.message);
    console.log("Using fallback parser");
    return fallbackParseMessage(message);
  }
};

export default parseMessage;
