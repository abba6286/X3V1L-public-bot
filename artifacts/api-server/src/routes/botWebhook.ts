import { Router } from "express";
import { webhookCallback } from "grammy";
import { bot, handleOtpWebhook } from "../bot/bot.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Telegram webhook - receives updates from Telegram
router.post("/telegram-webhook", async (req, res, next) => {
  try {
    const handler = webhookCallback(bot, "express");
    await handler(req, res);
  } catch (err) {
    next(err);
  }
});

// SMSBower OTP webhook - receives OTP notifications from SMSBower
router.post("/sms-webhook", async (req, res) => {
  try {
    logger.info({ body: req.body }, "SMSBower webhook received");
    await handleOtpWebhook(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "SMSBower webhook error");
    res.status(200).json({ ok: false }); // Always 200 to SMSBower
  }
});

// Also handle GET (SMSBower sometimes sends GET)
router.get("/sms-webhook", async (req, res) => {
  try {
    logger.info({ query: req.query }, "SMSBower webhook GET received");
    const payload = {
      activationId: req.query["activationId"] as string ?? req.query["id"] as string,
      code: req.query["code"] as string,
      service: req.query["service"] as string,
      phone: req.query["phone"] as string,
    };
    await handleOtpWebhook(payload);
    res.status(200).send("OK");
  } catch (err) {
    logger.error({ err }, "SMSBower webhook GET error");
    res.status(200).send("OK");
  }
});

export default router;
