import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
    },

    // Store transaction history as an array of transactions
    transactions: [
      {
        itemName: {
          type: String,
          default: "",
        },
        itemDescription: {
          type: String,
          default: "",
        },
        quantity: {
          type: Number,
          default: 1,
        },
        amount: {
          type: Number,
          default: 0,
        },
        paid: {
          type: Number,
          default: 0,
        },
        transactionType: {
          type: String,
          enum: ["debit", "credit", "payment"],
          default: "debit",
        },
        originalMessage: {
          type: String,
          default: "",
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Current running totals
    totalAmount: {
      type: Number,
      default: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    totalDue: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate totalDue
customerSchema.pre('save', function(next) {
  this.totalDue = this.totalAmount - this.totalPaid;
  next();
});

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;