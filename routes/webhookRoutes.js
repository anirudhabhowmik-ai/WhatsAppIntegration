import express from "express";
import { verifyWebhook, handleIncomingMessage } from "../services/whatsappService.js";

const router = express.Router();

// GET - Webhook verification from Meta
router.get("/webhook", verifyWebhook);

// POST - Receive WhatsApp messages
router.post("/webhook", handleIncomingMessage);

export default router;