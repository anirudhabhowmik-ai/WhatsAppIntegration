import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import messageRoutes from "./routes/messageRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
