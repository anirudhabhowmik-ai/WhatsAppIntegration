import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import messageRoutes from "./routes/messageRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ── DB ────────────────────────────────────────────────────────────────────────
await connectDB();

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/message", messageRoutes);
app.use("/whatsapp", webhookRoutes);  // New WhatsApp webhook route

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "✅ Server is running!", timestamp: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler (4 params = Express error middleware) ────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack);
  res
    .status(500)
    .json({ success: false, message: "Something went wrong: " + err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📞 WhatsApp webhook URL: http://localhost:${PORT}/whatsapp/webhook`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});