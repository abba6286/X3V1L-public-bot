import { Bot, Context } from "grammy";
import { IUser } from "../models/user.js";
import { SUPPORT_USERNAME } from "../config.js";
import { safeDeleteMessage } from "../utils.js";

export async function showSupport(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<void> {
  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
  }
  const msg = await ctx.reply(
    `🆘 <b>Support</b>\n\nFor help, contact: <b>${SUPPORT_USERNAME}</b>`,
    { parse_mode: "HTML" },
  );
  user.lastMessageId = msg.message_id;
  await user.save();
}
