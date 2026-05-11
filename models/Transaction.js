import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    itemName: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      default: 1,
    },

    amount: {
      type: Number,
      required: true,
    },

    originalMessage: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model(
  "Transaction",
  transactionSchema
);

export default Transaction;