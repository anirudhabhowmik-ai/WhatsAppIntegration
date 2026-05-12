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
});

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    transactions: [transactionSchema],
    totalAmount: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ FIX: No 'next' parameter — Mongoose uses returned Promise automatically
customerSchema.pre("save", function () {
  this.totalDue = this.totalAmount - this.totalPaid;
});

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;