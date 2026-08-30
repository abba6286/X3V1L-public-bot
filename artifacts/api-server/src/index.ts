import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./bot/database.js";
import { createBot } from "./bot/bot.js";
import { startScheduler } from "./bot/scheduler.js";
import { assertConfig, BOT_TOKEN, WEBHOOK_URL } from "./bot/config.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  // Validate config
  assertConfig();

  // Connect to MongoDB
  await connectDatabase();

  // Create and initialize Grammy bot
  const bot = await createBot();

  // Start cron jobs
  startScheduler(bot);

  // Remove any old Telegram webhook before starting long polling.
  // Pending updates are preserved so user messages are not silently lost.
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  logger.info("Telegram webhook disabled; starting long polling");

  const webhookBase = WEBHOOK_URL ||
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "");

  // Start Express server for health checks and the SMSBower OTP callback.
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    if (webhookBase) {
      logger.info(`SMSBower webhook: ${webhookBase}/api/sms-webhook`);
    } else {
      logger.warn("WEBHOOK_URL is not set; configure SMSBower webhook manually");
    }
  });

  // Long polling receives Telegram updates without a public Telegram webhook.
  bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, "Telegram long polling started");
    },
  }).catch((err) => {
    logger.error({ err }, "Telegram long polling stopped");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, "Startup failed");
  process.exit(1);
});
