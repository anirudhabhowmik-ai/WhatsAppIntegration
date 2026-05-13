import express from "express";
import { verifyWebhook, handleIncomingMessage } from "../services/whatsappService.js";

const router = express.Router();

router.get("/webhook", verifyWebhook);
router.post("/webhook", handleIncomingMessage);

export default router;