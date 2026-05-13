import express from "express";
import Shopkeeper from "../models/Shopkeeper.js";
import crypto from "crypto";

const router = express.Router();

// Register a new shopkeeper
router.post("/register", async (req, res) => {
  try {
    const { 
      whatsappBusinessAccountId, 
      phoneNumber, 
      shopName, 
      ownerName, 
      email 
    } = req.body;
    
    // Check if already exists
    const existing = await Shopkeeper.findOne({ 
      $or: [
        { whatsappBusinessAccountId },
        { phoneNumber }
      ]
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "Shopkeeper already registered" 
      });
    }
    
    // Create new shopkeeper
    const shopkeeper = new Shopkeeper({
      whatsappBusinessAccountId,
      phoneNumber,
      shopName,
      ownerName,
      email,
      apiKey: crypto.randomBytes(32).toString("hex")
    });
    
    await shopkeeper.save();
    
    res.json({
      success: true,
      message: "Shopkeeper registered successfully",
      data: {
        apiKey: shopkeeper.apiKey,
        shopName: shopkeeper.shopName,
        whatsappBusinessAccountId: shopkeeper.whatsappBusinessAccountId
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get shopkeeper details
router.get("/:apiKey", async (req, res) => {
  try {
    const shopkeeper = await Shopkeeper.findOne({ apiKey: req.params.apiKey });
    if (!shopkeeper) {
      return res.status(404).json({ success: false, message: "Shopkeeper not found" });
    }
    
    res.json({
      success: true,
      data: {
        shopName: shopkeeper.shopName,
        ownerName: shopkeeper.ownerName,
        phoneNumber: shopkeeper.phoneNumber,
        totalCustomers: await Customer.countDocuments({ shopkeeperId: shopkeeper._id }),
        settings: shopkeeper.settings
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;