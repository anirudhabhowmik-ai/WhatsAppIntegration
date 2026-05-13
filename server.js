import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import messageRoutes from "./routes/messageRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

await connectDB();

// Routes
app.use("/message", messageRoutes);
app.use("/whatsapp", webhookRoutes);
app.use("/api/auth", authRoutes); // Shopkeeper registration

app.get("/", (req, res) => {
  res.json({ message: "Multi-Tenant WhatsApp Ledger System" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
