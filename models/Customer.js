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
      deafault: 1,
    },

    amount:{
      type: Number,
      deafault: 0,
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

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;