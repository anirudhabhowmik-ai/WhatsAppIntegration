import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fallback parser
const fallbackParseMessage = (message) => {
  console.log("⚠️ Using fallback parser for:", message);
  
  const words = message.trim().split(/\s+/);
  let customerName = words[0] || "Unknown";
  let quantity = 1;
  let itemName = "";
  let amount = 0;
  
  // Find quantity
  let quantityIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (!isNaN(words[i]) && words[i].trim() !== "") {
      quantity = parseInt(words[i]);
      quantityIndex = i;
      break;
    }
  }
  
  // Find amount
  const numbers = message.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    amount = parseInt(numbers[numbers.length - 1]);
  }
  
  // Extract item name
  if (quantityIndex !== -1) {
    if (amount > 0 && numbers && numbers.length >= 2) {
      const lastNumberIndex = message.lastIndexOf(numbers[numbers.length - 1].toString());
      const beforeAmount = message.substring(0, lastNumberIndex).trim();
      const afterQuantity = beforeAmount.substring(beforeAmount.indexOf(words[quantityIndex]) + words[quantityIndex].length);
      itemName = afterQuantity.trim();
    } else {
      itemName = words.slice(quantityIndex + 1).join(" ");
      itemName = itemName.replace(/rs|rupees|₹/gi, '').trim();
    }
  }
  
  return {
    customerName: customerName || "Unknown",
    quantity: quantity || 1,
    itemName: itemName || "item",
    amount: amount || 0,
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
      Parse this shopkeeper message and return ONLY valid JSON.
      
      Message: "${message}"
      
      Return format: {"customerName":"name","quantity":number,"itemName":"item","itemDescription":"desc","amount":number}
      
      Examples:
      "Ravi 2 milk 40 rs" → {"customerName":"Ravi","quantity":2,"itemName":"milk","itemDescription":"brought cow milk","amount":40}
      "John bread 25 rupees" → {"customerName":"John","quantity":1,"itemName":"bread","itemDescription":"brown bread","amount":25}
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean and parse JSON
    let cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];
    
    const parsedData = JSON.parse(cleanedText);
    
    console.log("✅ Gemini parsed:", parsedData);
    
    return {
      customerName: parsedData.customerName || "Unknown",
      quantity: parsedData.quantity || 1,
      itemName: parsedData.itemName || "item",
      itemDescription: parsedData.itemDescription || "",
      amount: parsedData.amount || 0,
      originalMessage: message,
    };
  } catch (error) {
    console.error("❌ Gemini error:", error.message);
    return fallbackParseMessage(message);
  }
};

export default parseMessage;