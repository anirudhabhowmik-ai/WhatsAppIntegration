import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  itemName: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  amount: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  transactionType: {
    type: String,
    enum: ["debit", "credit", "payment"],
    default: "debit",
  },
  originalMessage: { type: String, default: "" },
  date: { type: Date, default: Date.now }
});

const customerSchema = new mongoose.Schema(
  {
    shopkeeperId: { type: String, default: "default", index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    transactions: [transactionSchema],
    totalAmount: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ shopkeeperId: 1, name: 1 }, { unique: true });

// ✅ FIXED: Added `next` parameter and calling next() at the end
customerSchema.pre("save", function(next) {
  this.totalDue = this.totalAmount - this.totalPaid;
  next();
});

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;