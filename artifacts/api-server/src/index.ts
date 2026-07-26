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

  // Set Telegram webhook
  const webhookBase = WEBHOOK_URL || `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  const telegramWebhookUrl = `${webhookBase}/api/telegram-webhook`;

  try {
    await bot.api.setWebhook(telegramWebhookUrl);
    logger.info({ url: telegramWebhookUrl }, "Telegram webhook set");
  } catch (err) {
    logger.error({ err }, "Failed to set Telegram webhook");
  }

  // Start Express server
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    logger.info(`Telegram webhook: ${telegramWebhookUrl}`);
    logger.info(`SMSBower webhook: ${webhookBase}/api/sms-webhook`);
  });
}

main().catch((err) => {
  logger.error({ err }, "Startup failed");
  process.exit(1);
});
