import { Bot, Context } from "grammy";
import { IUser } from "../models/user.js";
import { ActiveNumber } from "../models/activeNumber.js";
import { serviceLabel, getFlagEmoji, formatBalance, formatPrice, safeDeleteMessage } from "../utils.js";

export async function showBalance(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<void> {
  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
  }

  const actives = await ActiveNumber.find({ telegramId: user.telegramId, status: "active" });

  let text = `💳 <b>Your Balance</b>\n\n`;
  text += `Balance: <b>${formatBalance(user.balance)}</b>\n`;
  text += `Total Spent: <b>${formatPrice(user.totalSpent)}</b>\n\n`;

  if (actives.length > 0) {
    text += `📱 <b>Active Numbers (${actives.length}):</b>\n`;
    for (const n of actives) {
      const flag = getFlagEmoji(n.countryName);
      const expiresIn = Math.max(0, Math.floor((n.expiresAt.getTime() - Date.now()) / 60000));
      text += `• ${flag} +${n.phoneNumber} (${serviceLabel(n.service)}) — ⏰ ${expiresIn}m left\n`;
    }
  }

  const msg = await ctx.reply(text, { parse_mode: "HTML" });
  user.lastMessageId = msg.message_id;
  await user.save();
}
