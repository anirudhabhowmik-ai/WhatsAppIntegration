import express from "express";
import { verifyWebhook, handleIncomingMessage } from "../services/whatsappService.js";

const router = express.Router();

// GET - Webhook verification from Meta
router.get("/webhook", (req, res) => {
  console.log("🔍 GET /webhook called");
  console.log("Query params:", req.query);
  
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`);

  // Check if mode and token are present and valid
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    console.error(`Expected token: ${process.env.VERIFY_TOKEN}, Received: ${token}`);
    res.sendStatus(403);
  }
});

// POST - Receive WhatsApp messages
router.post("/webhook", handleIncomingMessage);

export default router;