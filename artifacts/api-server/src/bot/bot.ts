import { Bot, Context, InlineKeyboard } from "grammy";
import { BOT_TOKEN, ADMIN_USER_ID, OTP_GROUP_ID } from "./config.js";
import { getOrCreateUser, IUser } from "./models/user.js";
import { ActiveNumber } from "./models/activeNumber.js";
import { User } from "./models/user.js";
import { getCountries, setStatus } from "./services/smsbower.js";
import { setCountryCache, getFlagEmoji, serviceLabel, formatPrice, formatBalance, safeDeleteMessage, autoDeleteMessage } from "./utils.js";
import { checkForceJoin, showMainMenu } from "./handlers/start.js";
import { startBuyFlow, handleServiceSelect, handleCountrySelect, handleCountryPage, handleProviderSelect, handleCancelNumber } from "./handlers/buyFlow.js";
import { startDeposit, handleTxId } from "./handlers/deposit.js";
import { showBalance } from "./handlers/balance.js";
import { showSupport } from "./handlers/support.js";
import {
  isAdmin, showAdminPanel, handleAdminCallback,
  handleAddBal, handleLessBal, handleAdminStateInput,
} from "./handlers/admin.js";
import { recordActivity } from "./models/userActivity.js";
import { otpGroupKeyboard } from "./keyboards.js";
import { Transaction } from "./models/transaction.js";
import { logger } from "../lib/logger.js";

export let bot: Bot;
export let botUsername = "";

export async function createBot(): Promise<Bot> {
  bot = new Bot(BOT_TOKEN);

  // Load country cache
  try {
    const countries = await getCountries();
    const cache: Record<number, string> = {};
    for (const c of countries) cache[c.id] = c.name;
    setCountryCache(cache);
    logger.info({ count: countries.length }, "Countries loaded");
  } catch (err) {
    logger.error({ err }, "Failed to load countries");
  }

  // Get bot username
  try {
    const me = await bot.api.getMe();
    botUsername = me.username ?? "";
    logger.info({ username: botUsername }, "Bot username loaded");
  } catch (err) {
    logger.error({ err }, "Failed to get bot username");
  }

  // ─── Global middleware: attach user ───────────────────────────────────────
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const user = await getOrCreateUser({
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
    });
    (ctx as Context & { user: IUser }).user = user;
    await next();
  });

  // ─── Auto-delete user text commands after 10s ─────────────────────────────
  bot.on("message", async (ctx, next) => {
    autoDeleteMessage(bot, ctx.chat.id, ctx.message.message_id, 10_000);
    await next();
  });

  // ─── /start ───────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    const joined = await checkForceJoin(bot, ctx, user);
    if (joined) {
      await showMainMenu(bot, ctx, user, `👋 Welcome, <b>${user.firstName ?? "there"}</b>!`);
    }
  });

  // ─── /admin command ───────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    if (!isAdmin(user.telegramId)) return;
    await showAdminPanel(bot, ctx, user);
  });

  // ─── /addbal {userId} {amount} ────────────────────────────────────────────
  bot.command("addbal", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    if (!isAdmin(user.telegramId)) return;
    const parts = ctx.match?.split(" ") ?? [];
    const userId = parseInt(parts[0] ?? "", 10);
    const amount = parseFloat(parts[1] ?? "");
    if (isNaN(userId) || isNaN(amount) || amount <= 0) {
      const m = await ctx.reply("Usage: /addbal {userId} {amount}", { parse_mode: "HTML" });
      autoDeleteMessage(bot, ctx.chat.id, m.message_id, 60_000);
      return;
    }
    await handleAddBal(bot, ctx, userId, amount);
  });

  // ─── /lessbal {userId} {amount} ───────────────────────────────────────────
  bot.command("lessbal", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    if (!isAdmin(user.telegramId)) return;
    const parts = ctx.match?.split(" ") ?? [];
    const userId = parseInt(parts[0] ?? "", 10);
    const amount = parseFloat(parts[1] ?? "");
    if (isNaN(userId) || isNaN(amount) || amount <= 0) {
      const m = await ctx.reply("Usage: /lessbal {userId} {amount}", { parse_mode: "HTML" });
      autoDeleteMessage(bot, ctx.chat.id, m.message_id, 60_000);
      return;
    }
    await handleLessBal(bot, ctx, userId, amount);
  });

  // ─── Text message handler ─────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    const text = ctx.message.text;

    // Admin state inputs
    if (isAdmin(user.telegramId)) {
      const handled = await handleAdminStateInput(bot, ctx, user, text);
      if (handled) return;
    }

    // State-based input
    if (user.state === "await_txid") {
      await handleTxId(bot, ctx, user, text);
      return;
    }

    // Delete previous reply when new menu command comes
    if (user.lastMessageId && ["🛒 Buy Number", "💰 Deposit", "💳 Balance", "🆘 Support"].includes(text)) {
      safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
      user.lastMessageId = undefined;
    }

    // Menu handlers
    if (text === "🛒 Buy Number") {
      await startBuyFlow(bot, ctx, user);
    } else if (text === "💰 Deposit") {
      await startDeposit(bot, ctx, user);
    } else if (text === "💳 Balance") {
      await showBalance(bot, ctx, user);
    } else if (text === "🆘 Support") {
      await showSupport(bot, ctx, user);
    } else if (user.state === "idle") {
      // Unknown input — show menu hint
      const m = await ctx.reply("Use the menu buttons below 👇", { reply_markup: { remove_keyboard: true } });
      autoDeleteMessage(bot, ctx.chat.id, m.message_id, 5_000);
    }
  });

  // ─── Photo in broadcast state ─────────────────────────────────────────────
  bot.on("message:photo", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    if (user.state === "admin_broadcast") {
      const photo = ctx.message.photo.at(-1);
      if (photo) {
        const mediaGroup = (user.stateData["mediaGroup"] as string[]) ?? [];
        mediaGroup.push(photo.file_id);
        user.stateData["mediaGroup"] = mediaGroup;
        await user.save();
        await ctx.reply(`📷 Photo added (${mediaGroup.length} total). Send more or /send to broadcast.`);
      }
    }
  });

  // ─── Callback query handler ───────────────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const user = (ctx as Context & { user: IUser }).user;
    const data = ctx.callbackQuery.data;

    // Force join verify
    if (data === "verify_join") {
      const joined = await checkForceJoin(bot, ctx, user);
      if (joined) {
        await ctx.answerCallbackQuery({ text: "✅ Verified!" });
        if (user.lastMessageId) {
          safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
          user.lastMessageId = undefined;
        }
        await showMainMenu(bot, ctx, user, `✅ Verified! Welcome, <b>${user.firstName ?? "there"}</b>!`);
      } else {
        await ctx.answerCallbackQuery({ text: "❌ Still missing channels. Join all and try again.", show_alert: true });
      }
      return;
    }

    // Cancel buy flow
    if (data === "cancel_buy") {
      await ctx.answerCallbackQuery();
      user.state = "idle";
      user.stateData = {};
      await user.save();
      try { await ctx.deleteMessage(); } catch {}
      return;
    }

    // Copy OTP/number — just ack (Telegram handles copy)
    if (data.startsWith("copy:") || data.startsWith("copy_num:")) {
      await ctx.answerCallbackQuery({ text: "📋 Copied!", show_alert: false });
      return;
    }

    // Service select
    if (data.startsWith("svc:")) {
      const service = data.split(":")[1] as "tg" | "wa";
      await handleServiceSelect(bot, ctx, user, service);
      return;
    }

    // Country page
    if (data.startsWith("cpage:")) {
      const parts = data.split(":");
      const service = parts[1]!;
      const page = parseInt(parts[2]!, 10);
      await handleCountryPage(ctx, user, service, page);
      return;
    }

    // Country select
    if (data.startsWith("ctry:")) {
      const parts = data.split(":");
      const service = parts[1] as "tg" | "wa";
      const countryId = parseInt(parts[2]!, 10);
      await handleCountrySelect(bot, ctx, user, service, countryId);
      return;
    }

    // Provider select
    if (data.startsWith("prov:")) {
      const parts = data.split(":");
      const service = parts[1] as "tg" | "wa";
      const countryId = parseInt(parts[2]!, 10);
      const providerIdx = parseInt(parts[3]!, 10);
      await handleProviderSelect(bot, ctx, user, service, countryId, providerIdx);
      return;
    }

    // Buy again
    if (data.startsWith("buyagain:")) {
      const parts = data.split(":");
      const service = parts[1] as "tg" | "wa";
      const countryId = parseInt(parts[2]!, 10);
      const providerIdx = parseInt(parts[3]!, 10);
      await ctx.answerCallbackQuery();
      await handleProviderSelect(bot, ctx, user, service, countryId, providerIdx);
      return;
    }

    // Cancel specific number
    if (data.startsWith("cancel_num:")) {
      const activationId = data.slice("cancel_num:".length);
      await handleCancelNumber(bot, ctx, user, activationId);
      return;
    }

    // Admin callbacks
    if (data.startsWith("admin:")) {
      if (!isAdmin(user.telegramId)) {
        await ctx.answerCallbackQuery({ text: "⛔ Not authorized.", show_alert: true });
        return;
      }
      const action = data.slice("admin:".length);
      await handleAdminCallback(bot, ctx, user, action);
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ─── Error handler ────────────────────────────────────────────────────────
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Grammy error");
  });

  return bot;
}

// ─── OTP webhook handler ───────────────────────────────────────────────────
export async function handleOtpWebhook(payload: {
  activationId?: string;
  id?: string | number;
  code?: string;
  text?: string;
  service?: string;
  phone?: string;
}): Promise<void> {
  const activationId = String(payload.activationId ?? payload.id ?? "");
  const otp = payload.code ?? payload.text ?? "";

  if (!activationId || !otp) {
    logger.warn({ payload }, "OTP webhook: missing activationId or otp");
    return;
  }

  const activeNumber = await ActiveNumber.findOne({ activationId, status: "active" });
  if (!activeNumber) {
    logger.warn({ activationId }, "OTP webhook: no active number found");
    return;
  }

  const flag = getFlagEmoji(activeNumber.countryName);
  const svcLabel = serviceLabel(activeNumber.service);
  const user = await User.findOne({ telegramId: activeNumber.telegramId });

  // 1. Send OTP to user FIRST
  const otpMsg = await bot.api.sendMessage(
    activeNumber.telegramId,
    `${flag} ${svcLabel} ${activeNumber.phoneNumber} ${formatPrice(activeNumber.price)}\n\n`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(`📋 ${otp}`, `copy:${otp}`),
    },
  );

  // 2. Delete purchase message
  if (activeNumber.messageId) {
    safeDeleteMessage(bot, activeNumber.telegramId, activeNumber.messageId);
  }

  // 3. Deduct balance atomically (only if not already deducted)
  if (!activeNumber.balanceDeducted) {
    activeNumber.balanceDeducted = true;
    await ActiveNumber.findOneAndUpdate(
      { activationId, balanceDeducted: false },
      { $set: { balanceDeducted: true, status: "completed" } },
    );
    await User.updateOne(
      { telegramId: activeNumber.telegramId },
      { $inc: { balance: -activeNumber.price, totalSpent: activeNumber.price } },
    );
  } else {
    activeNumber.status = "completed";
    await activeNumber.save();
  }

  // 4. Record OTP activity
  await recordActivity(
    activeNumber.telegramId,
    user?.username,
    user?.firstName,
    "otps",
    activeNumber.price,
    activeNumber.price,
    activeNumber.service,
    activeNumber.countryName,
  );

  // 5. Forward to OTP group
  if (OTP_GROUP_ID) {
    try {
      await bot.api.sendMessage(
        OTP_GROUP_ID,
        `${flag} ${svcLabel} 🆔 ${activeNumber.telegramId}\n\n`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(`📋 ${activeNumber.phoneNumber}`, `copy:${otp}`)
            .row()
            .url("🤖 Number Bot", `https://t.me/${botUsername}`)
            .url("👤 Profile", `tg://openmessage?user_id=${activeNumber.telegramId}`),
        },
      );
    } catch (err) {
      logger.error({ err }, "Failed to forward OTP to group");
    }
  }

  // 6. Mark setStatus 6 (complete activation) with SMSBower
  try {
    await setStatus(activationId, 6);
  } catch { /* ignore */ }
}
