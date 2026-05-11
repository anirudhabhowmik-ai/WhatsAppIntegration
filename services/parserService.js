import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini with your NEW API key (get from environment variable)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fallback parser for when Gemini fails
const fallbackParseMessage = (message) => {
  const words = message.trim().split(/\s+/);
  
  let customerName = words[0] || "Unknown";
  let quantity = 1;
  let itemName = "";
  let amount = 0;
  
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
  
  // Extract item name (words between quantity and amount or after quantity)
  if (quantityIndex !== -1) {
    // If amount is found separately
    if (amount > 0 && numbers && numbers.length >= 2) {
      // Get words between quantity and the last number
      const lastNumberIndex = message.lastIndexOf(numbers[numbers.length - 1].toString());
      const beforeAmount = message.substring(0, lastNumberIndex).trim();
      const afterQuantity = beforeAmount.substring(beforeAmount.indexOf(words[quantityIndex]) + words[quantityIndex].length);
      itemName = afterQuantity.trim();
    } else {
      // Get all words after quantity
      itemName = words.slice(quantityIndex + 1).join(" ");
      // Remove "rs" or "rupees" if present
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

// Main parser using Gemini
const parseMessage = async (message) => {
  try {
    // Use Gemini 2.0 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    const prompt = `
      You are a parser for shopkeeper messages. Parse the following message and extract:
      - customerName (person's name)
      - quantity (number of items)
      - itemName (what product/service)
      - amount (price in rupees)
      
      Message: "${message}"
      
      Return ONLY a valid JSON object in this exact format, no other text:
      {
        "customerName": "extracted name",
        "quantity": number,
        "itemName": "extracted item",
        "amount": number
      }
      
      Examples:
      "Ravi 2 milk 40 rs" -> {"customerName":"Ravi","quantity":2,"itemName":"milk","amount":40}
      "John bread 25 rupees" -> {"customerName":"John","quantity":1,"itemName":"bread","amount":25}
      "Priya 3 coffee 150" -> {"customerName":"Priya","quantity":3,"itemName":"coffee","amount":150}
      "Suresh 1kg rice 60 rs" -> {"customerName":"Suresh","quantity":1,"itemName":"rice","amount":60}
      
      If a field cannot be found, use defaults: name as "Unknown", quantity as 1, item as "item", amount as 0.
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean the response to extract JSON
    let cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to find JSON object if there's extra text
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
    }
    
    const parsedData = JSON.parse(cleanedText);
    
    console.log("Gemini parsed:", parsedData);
    
    return {
      customerName: parsedData.customerName || "Unknown",
      quantity: parsedData.quantity || 1,
      itemName: parsedData.itemName || "item",
      amount: parsedData.amount || 0,
      originalMessage: message,
    };
  } catch (error) {
    console.error("Gemini parsing error:", error.message);
    console.log("Using fallback parser");
    
    // Use fallback parser if Gemini fails
    return fallbackParseMessage(message);
  }
};

export default parseMessage;