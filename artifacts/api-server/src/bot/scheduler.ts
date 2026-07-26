import cron from "node-cron";
import { ActiveNumber } from "./models/activeNumber.js";
import { User } from "./models/user.js";
import { cancelNumber } from "./services/smsbower.js";
import { recordActivity } from "./models/userActivity.js";
import { sendDailyReport } from "./handlers/admin.js";
import { logger } from "../lib/logger.js";
import { Bot } from "grammy";

export function startScheduler(bot: Bot): void {
  // Every minute: expire numbers older than 20 minutes
  cron.schedule("* * * * *", async () => {
    try {
      const expired = await ActiveNumber.find({
        status: "active",
        expiresAt: { $lt: new Date() },
      });

      for (const num of expired) {
        num.status = "expired";
        await num.save();

        try {
          await cancelNumber(num.activationId);
        } catch { /* ignore */ }

        // Delete purchase message
        if (num.messageId) {
          try {
            await bot.api.deleteMessage(num.telegramId, num.messageId);
          } catch { /* ignore */ }
        }

        // Notify user
        try {
          await bot.api.sendMessage(
            num.telegramId,
            `⏰ Number <b>+${num.phoneNumber}</b> has expired (20 min limit).`,
            { parse_mode: "HTML" },
          );
        } catch { /* ignore */ }

        await recordActivity(
          num.telegramId,
          undefined,
          undefined,
          "cancels",
          0,
          0,
        );
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: expire check failed");
    }
  });

  // Daily report at midnight Bangladesh time = 18:00 UTC
  cron.schedule("0 18 * * *", async () => {
    try {
      await sendDailyReport(bot);
    } catch (err) {
      logger.error({ err }, "Scheduler: daily report failed");
    }
  });

  logger.info("Scheduler started");
}
