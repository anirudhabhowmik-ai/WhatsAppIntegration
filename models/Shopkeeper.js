import mongoose from "mongoose";
import crypto from "crypto"; // ✅ FIXED: Added missing crypto import

const shopkeeperSchema = new mongoose.Schema(
  {
    // WhatsApp Business Account ID from Meta
    whatsappBusinessAccountId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true 
    },
    
    // Shopkeeper's WhatsApp number
    phoneNumber: { 
      type: String, 
      required: true, 
      unique: true 
    },
    
    // Shop name/business name
    shopName: { 
      type: String, 
      required: true 
    },
    
    // Owner's name
    ownerName: { 
      type: String, 
      required: true 
    },
    
    // Email for notifications
    email: { 
      type: String,
      lowercase: true,
      trim: true
    },
    
    // Shop settings
    settings: {
      currency: { type: String, default: "₹" },
      language: { type: String, default: "en" }, // en, hi, mr, te, ta, etc.
      autoReply: { type: Boolean, default: true },
      notifyOnPayment: { type: Boolean, default: true }
    },
    
    // Account status
    isActive: { type: Boolean, default: true },
    
    // Subscription/Plan
    plan: { 
      type: String, 
      enum: ["free", "basic", "premium"], 
      default: "free"
    },
    
    // API keys for webhook
    apiKey: { type: String, unique: true },
    
    // Metadata
    registeredAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// ✅ FIXED: Added `next` parameter and calling next() at the end
shopkeeperSchema.pre("save", async function(next) {
  if (!this.apiKey) {
    this.apiKey = crypto.randomBytes(32).toString("hex");
  }
  next();
});

const Shopkeeper = mongoose.model("Shopkeeper", shopkeeperSchema);
export default Shopkeeper;