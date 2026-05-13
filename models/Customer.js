import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  itemName: { type: String, default: "" },
  itemDescription: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  amount: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  transactionType: {
    type: String,
    enum: ["debit", "credit", "payment"],
    default: "debit",
  },
  originalMessage: { type: String, default: "" },
  date: { type: Date, default: Date.now },
  // Track which shopkeeper added this transaction
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Shopkeeper" }
});

const customerSchema = new mongoose.Schema(
  {
    // Link to shopkeeper
    shopkeeperId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Shopkeeper",
      required: true,
      index: true
    },
    
    // Customer details
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    
    // Make customer unique per shopkeeper
    // Same customer name can exist for different shopkeepers
    transactions: [transactionSchema],
    totalAmount: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    
    // Customer metadata
    notes: { type: String, default: "" },
    tags: [{ type: String }], // e.g., "wholesale", "regular", "vip"
    lastInteraction: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Compound index to ensure unique customer name per shopkeeper
customerSchema.index({ shopkeeperId: 1, name: 1 }, { unique: true });

// Auto-calculate total due
customerSchema.pre("save", function() {
  this.totalDue = this.totalAmount - this.totalPaid;
  this.lastInteraction = new Date();
});

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;