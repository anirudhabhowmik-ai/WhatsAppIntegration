import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import messageRoutes from "./routes/messageRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";  // ← ADD THIS IMPORT

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Atlas Connected");
  } catch (error) {
    console.error("❌ MongoDB Error:", error.message);
    process.exit(1);
  }
};

await connectDB();

// Routes
app.use("/message", messageRoutes);
app.use("/whatsapp", webhookRoutes);
app.use("/api/auth", authRoutes);  // ← ADD THIS LINE - Mount auth routes

// Health check for Render
app.get("/", (req, res) => {
  res.json({
    status: "✅ WhatsApp Bot Running",
    environment: "Render",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Debug endpoint to check registered shopkeepers
app.get("/debug/shopkeepers", async (req, res) => {
  try {
    const Shopkeeper = (await import("./models/Shopkeeper.js")).default;
    const shopkeepers = await Shopkeeper.find({});
    res.json({
      count: shopkeepers.length,
      shopkeepers: shopkeepers.map(s => ({
        id: s._id,
        shopName: s.shopName,
        ownerName: s.ownerName,
        phoneNumber: s.phoneNumber,
        whatsappBusinessAccountId: s.whatsappBusinessAccountId,
        apiKey: s.apiKey,
        isActive: s.isActive
      }))
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Debug endpoint to check all customers (with shopkeeper info)
app.get("/debug/all-customers", async (req, res) => {
  try {
    const Customer = (await import("./models/Customer.js")).default;
    const customers = await Customer.find({}).populate('shopkeeperId', 'shopName phoneNumber');
    res.json({
      count: customers.length,
      customers: customers.map(c => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        shopkeeper: c.shopkeeperId,
        totalAmount: c.totalAmount,
        totalDue: c.totalDue,
        transactionCount: c.transactions.length
      }))
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📞 Webhook URL: https://your-app.onrender.com/whatsapp/webhook`);
  console.log(`🔐 Auth routes available at:`);
  console.log(`   POST /api/auth/register - Register a new shopkeeper`);
  console.log(`   GET  /api/auth/:apiKey - Get shopkeeper details`);
});