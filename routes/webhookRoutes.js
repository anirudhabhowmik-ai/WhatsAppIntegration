import express from "express";
import { handleIncomingMessage } from "../services/whatsappService.js";

const router = express.Router();

// GET - Webhook verification from Meta
router.get("/webhook", (req, res) => {
  console.log("🔍 GET /webhook called");

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`);

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    console.error(`Expected: ${process.env.VERIFY_TOKEN}, Received: ${token}`);
    res.sendStatus(403);
  }
});

// POST - Receive WhatsApp messages
// Note: handleIncomingMessage already calls res.sendStatus(200) internally
router.post("/webhook", async (req, res) => {
  console.log("🔥 POST /webhook received");
  await handleIncomingMessage(req, res);
});

export default router;
