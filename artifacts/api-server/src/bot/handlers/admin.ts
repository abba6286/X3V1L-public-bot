import { Bot, Context, InlineKeyboard } from "grammy";
import { IUser, User } from "../models/user.js";
import { UserActivity, getBdDate } from "../models/userActivity.js";
import { ActiveNumber } from "../models/activeNumber.js";
import { getConfig, setConfig, getExtraMargin, getMaxActiveNumbers } from "../models/botConfig.js";
import { ADMIN_USER_ID, OTP_GROUP_ID } from "../config.js";
import { adminPanelKeyboard } from "../keyboards.js";
import { formatBalance, formatPrice, getFlagEmoji, serviceLabel, safeDeleteMessage } from "../utils.js";

export function isAdmin(telegramId: number): boolean {
  return telegramId === ADMIN_USER_ID;
}

export async function showAdminPanel(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<void> {
  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
  }
  const margin = await getExtraMargin();
  const limit = await getMaxActiveNumbers();
  const userCount = await User.countDocuments();
  const activeNums = await ActiveNumber.countDocuments({ status: "active" });

  const msg = await ctx.reply(
    `🔐 <b>Admin Panel</b>\n\n` +
      `👥 Total Users: <b>${userCount}</b>\n` +
      `📱 Active Numbers: <b>${activeNums}</b>\n` +
      `💰 Extra Margin: <b>$${margin.toFixed(3)}</b>\n` +
      `🔢 Number Limit/User: <b>${limit}</b>`,
    { parse_mode: "HTML", reply_markup: adminPanelKeyboard() },
  );
  user.lastMessageId = msg.message_id;
  await user.save();
}

export async function handleAdminCallback(
  bot: Bot,
  ctx: Context,
  user: IUser,
  action: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  if (action === "reports") {
    await showReports(ctx, user);
  } else if (action === "leaderboard") {
    await showLeaderboard(ctx, user);
  } else if (action === "margin") {
    user.state = "admin_set_margin";
    await user.save();
    await ctx.editMessageText(
      `💰 Current extra margin: <b>$${(await getExtraMargin()).toFixed(3)}</b>\n\nSend new margin value (e.g. <code>0.01</code>):`,
      { parse_mode: "HTML" },
    );
  } else if (action === "limit") {
    user.state = "admin_set_limit";
    await user.save();
    await ctx.editMessageText(
      `🔢 Current limit: <b>${await getMaxActiveNumbers()}</b>\n\nSend new limit (e.g. <code>3</code>):`,
      { parse_mode: "HTML" },
    );
  } else if (action === "forcejoin") {
    const current = await getConfig("forceJoinChannels");
    const currentStr = Array.isArray(current) ? current.join(", ") : String(current ?? "none");
    user.state = "admin_set_forcejoin";
    await user.save();
    await ctx.editMessageText(
      `📢 Current force-join channels:\n<code>${currentStr}</code>\n\nSend new channels (comma-separated, e.g. <code>@chan1, @chan2</code>), or send <code>clear</code> to remove all:`,
      { parse_mode: "HTML" },
    );
  } else if (action === "broadcast") {
    user.state = "admin_broadcast";
    user.stateData = { mediaGroup: [] };
    await user.save();
    await ctx.editMessageText(
      "📣 <b>Broadcast</b>\n\nSend your message (text + optional photos). When done, send <code>/send</code> to broadcast.",
      { parse_mode: "HTML" },
    );
  } else if (action === "users") {
    const users = await User.find().sort({ balance: -1 }).limit(20);
    const list = users
      .map(
        (u, i) =>
          `${i + 1}. @${u.username ?? "—"} (${u.telegramId}) — ${formatBalance(u.balance)}`,
      )
      .join("\n");
    await ctx.editMessageText(
      `👥 <b>Top 20 Users by Balance</b>\n\n${list || "No users."}`,
      { parse_mode: "HTML" },
    );
  }
}

async function showReports(ctx: Context, user: IUser): Promise<void> {
  const now = new Date();
  const bdOffset = 6 * 60 * 60 * 1000;
  const bdNow = new Date(now.getTime() + bdOffset);

  const dates: { label: string; from: Date }[] = [
    { label: "Last 24h", from: new Date(bdNow.getTime() - 24 * 3600 * 1000) },
    { label: "Last 7d", from: new Date(bdNow.getTime() - 7 * 24 * 3600 * 1000) },
    { label: "Last 30d", from: new Date(bdNow.getTime() - 30 * 24 * 3600 * 1000) },
  ];

  let text = "📊 <b>Reports</b>\n\n";

  for (const { label, from } of dates) {
    const acts = await UserActivity.find({ date: { $gte: from.toISOString().slice(0, 10) } });
    const totalBuy = acts.reduce((s, a) => s + a.buys, 0);
    const totalCancel = acts.reduce((s, a) => s + a.cancels, 0);
    const totalOtp = acts.reduce((s, a) => s + a.otps, 0);
    const totalRevenue = acts.reduce((s, a) => s + a.spent, 0);

    text +=
      `📅 <b>${label}</b>\n` +
      `Buy: ${totalBuy} | Cancel: ${totalCancel} | OTP: ${totalOtp} | Revenue: ${formatPrice(totalRevenue)}\n\n`;
  }

  await ctx.editMessageText(text, { parse_mode: "HTML" });
}

async function showLeaderboard(ctx: Context, user: IUser): Promise<void> {
  const today = getBdDate();
  const acts = await UserActivity.find({ date: today }).sort({ otps: -1 }).limit(10);

  if (acts.length === 0) {
    await ctx.editMessageText("🏆 <b>Today's Leaderboard</b>\n\nNo activity yet today.", { parse_mode: "HTML" });
    return;
  }

  let text = `🏆 <b>Today's Leaderboard</b> (${today})\n\n`;
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i]!;
    text += `${i + 1}. @${a.username ?? a.firstName ?? a.telegramId} — 📥 ${a.otps} OTP | 🛒 ${a.buys} buy | 💰 ${formatPrice(a.spent)}\n`;
  }

  await ctx.editMessageText(text, { parse_mode: "HTML" });
}

export async function handleAddBal(
  bot: Bot,
  ctx: Context,
  userId: number,
  amount: number,
): Promise<void> {
  const target = await User.findOne({ telegramId: userId });
  if (!target) {
    await ctx.reply(`❌ User ${userId} not found.`);
    return;
  }
  await User.updateOne({ telegramId: userId }, { $inc: { balance: amount } });
  await ctx.reply(`✅ Added <b>${formatBalance(amount)}</b> to user ${userId}.\nNew balance: <b>${formatBalance(target.balance + amount)}</b>`, { parse_mode: "HTML" });

  try {
    await bot.api.sendMessage(
      userId,
      `💰 Your balance has been topped up by <b>${formatBalance(amount)}</b>.\nNew balance: <b>${formatBalance(target.balance + amount)}</b>`,
      { parse_mode: "HTML" },
    );
  } catch { /* user may have blocked bot */ }
}

export async function handleLessBal(
  bot: Bot,
  ctx: Context,
  userId: number,
  amount: number,
): Promise<void> {
  const target = await User.findOne({ telegramId: userId });
  if (!target) {
    await ctx.reply(`❌ User ${userId} not found.`);
    return;
  }
  await User.updateOne({ telegramId: userId }, { $inc: { balance: -amount } });
  await ctx.reply(`✅ Deducted <b>${formatBalance(amount)}</b> from user ${userId}.\nNew balance: <b>${formatBalance(target.balance - amount)}</b>`, { parse_mode: "HTML" });

  try {
    await bot.api.sendMessage(
      userId,
      `⚠️ Your balance was reduced by <b>${formatBalance(amount)}</b>.\nNew balance: <b>${formatBalance(target.balance - amount)}</b>`,
      { parse_mode: "HTML" },
    );
  } catch { /* user may have blocked bot */ }
}

export async function sendDailyReport(bot: Bot): Promise<void> {
  const today = getBdDate();
  const acts = await UserActivity.find({ date: today });

  const totalBuy = acts.reduce((s, a) => s + a.buys, 0);
  const totalCancel = acts.reduce((s, a) => s + a.cancels, 0);
  const totalOtp = acts.reduce((s, a) => s + a.otps, 0);

  // Build service breakdown
  const breakdown: Record<string, Record<string, { count: number; revenue: number }>> = {};
  for (const act of acts) {
    for (const sb of act.serviceBreakdown) {
      if (!breakdown[sb.service]) breakdown[sb.service] = {};
      if (!breakdown[sb.service]![sb.countryName]) {
        breakdown[sb.service]![sb.countryName] = { count: 0, revenue: 0 };
      }
      breakdown[sb.service]![sb.countryName]!.count += sb.count;
      breakdown[sb.service]![sb.countryName]!.revenue += sb.revenue;
    }
  }

  let text =
    `📊 <b>Daily Activity Summary</b> (${today} BD Time)\n\n` +
    `Today total OTP received: <b>${totalOtp}</b>\n` +
    `Total buy: <b>${totalBuy}</b>\n` +
    `Total cancel ❌: <b>${totalCancel}</b>\n\n`;

  for (const [svc, countries] of Object.entries(breakdown)) {
    text += `<b>${serviceLabel(svc)}:</b>\n`;
    for (const [country, stats] of Object.entries(countries)) {
      const flag = getFlagEmoji(country);
      text += `${flag} ${country}: ${stats.count} pcs, ${formatPrice(stats.revenue)}\n`;
    }
    text += "\n";
  }

  // Top users
  const topUsers = acts
    .filter((a) => a.otps > 0)
    .sort((a, b) => b.otps - a.otps)
    .slice(0, 10);

  if (topUsers.length > 0) {
    text += `<b>Top Users:</b>\n`;
    for (const u of topUsers) {
      text += `@${u.username ?? u.firstName ?? u.telegramId}: ${u.otps} OTP | ${formatPrice(u.spent)}\n`;
    }
  }

  if (OTP_GROUP_ID) {
    try {
      await bot.api.sendMessage(OTP_GROUP_ID, text, { parse_mode: "HTML" });
    } catch (err) {
      console.error("Failed to send daily report:", err);
    }
  }
}

export async function handleAdminStateInput(
  bot: Bot,
  ctx: Context,
  user: IUser,
  text: string,
): Promise<boolean> {
  const state = user.state;

  if (state === "admin_set_margin") {
    const val = parseFloat(text);
    if (isNaN(val) || val < 0) {
      await ctx.reply("❌ Invalid value. Send a number like <code>0.01</code>", { parse_mode: "HTML" });
      return true;
    }
    await setConfig("extraMargin", val);
    user.state = "idle";
    await user.save();
    await ctx.reply(`✅ Extra margin set to <b>$${val.toFixed(3)}</b>`, { parse_mode: "HTML" });
    return true;
  }

  if (state === "admin_set_limit") {
    const val = parseInt(text, 10);
    if (isNaN(val) || val < 1) {
      await ctx.reply("❌ Invalid value. Send a positive integer like <code>3</code>", { parse_mode: "HTML" });
      return true;
    }
    await setConfig("maxActiveNumbers", val);
    user.state = "idle";
    await user.save();
    await ctx.reply(`✅ Active number limit set to <b>${val}</b>`, { parse_mode: "HTML" });
    return true;
  }

  if (state === "admin_set_forcejoin") {
    if (text.toLowerCase() === "clear") {
      await setConfig("forceJoinChannels", []);
      user.state = "idle";
      await user.save();
      await ctx.reply("✅ Force-join channels cleared.");
    } else {
      const channels = text.split(",").map((s) => s.trim()).filter(Boolean);
      await setConfig("forceJoinChannels", channels);
      user.state = "idle";
      await user.save();
      await ctx.reply(`✅ Force-join channels updated:\n${channels.join("\n")}`, { parse_mode: "HTML" });
    }
    return true;
  }

  if (state === "admin_broadcast") {
    if (text === "/send") {
      const broadcastText = (user.stateData["broadcastText"] as string) ?? "";
      const mediaGroup = (user.stateData["mediaGroup"] as string[]) ?? [];
      user.state = "idle";
      user.stateData = {};
      await user.save();

      const allUsers = await User.find({}, { telegramId: 1 });
      let sent = 0;
      let failed = 0;

      for (const u of allUsers) {
        try {
          if (mediaGroup.length > 0) {
            const media = mediaGroup.map((id, i) => ({
              type: "photo" as const,
              media: id,
              caption: i === 0 ? broadcastText : undefined,
              parse_mode: "HTML" as const,
            }));
            await bot.api.sendMediaGroup(u.telegramId, media as Parameters<typeof bot.api.sendMediaGroup>[1]);
          } else {
            await bot.api.sendMessage(u.telegramId, broadcastText, { parse_mode: "HTML" });
          }
          sent++;
        } catch {
          failed++;
        }
        await new Promise((r) => setTimeout(r, 50)); // rate limit
      }

      await ctx.reply(`✅ Broadcast done. Sent: ${sent}, Failed: ${failed}`);
      return true;
    }

    // Accumulate text
    user.stateData["broadcastText"] = text;
    await user.save();
    await ctx.reply("📝 Text saved. Add photos or send /send to broadcast.");
    return true;
  }

  return false;
}
