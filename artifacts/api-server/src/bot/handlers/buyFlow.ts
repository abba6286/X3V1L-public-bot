import { Bot, Context, InlineKeyboard } from "grammy";
import { IUser } from "../models/user.js";
import { ActiveNumber } from "../models/activeNumber.js";
import { getExtraMargin, getMaxActiveNumbers } from "../models/botConfig.js";
import { recordActivity } from "../models/userActivity.js";
import {
  getAvailableCountriesForService,
  buyNumber,
  cancelNumber,
} from "../services/smsbower.js";
import { getCountryName, getFlagEmoji, serviceLabel, formatPrice, paginate, totalPages, safeDeleteMessage, autoDeleteMessage } from "../utils.js";
import {
  serviceKeyboard,
  countryPageKeyboard,
  providerKeyboard,
  numberPurchasedKeyboard,
} from "../keyboards.js";
import { SUPPORT_USERNAME } from "../config.js";

const COUNTRIES_PER_PAGE = 15;

export async function startBuyFlow(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<void> {
  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
  }
  const msg = await ctx.reply(
    "🛒 <b>Buy a Number</b>\n\nSelect service:",
    { parse_mode: "HTML", reply_markup: serviceKeyboard() },
  );
  user.lastMessageId = msg.message_id;
  user.state = "select_service";
  user.stateData = {};
  await user.save();
}

export async function handleServiceSelect(
  bot: Bot,
  ctx: Context,
  user: IUser,
  service: "tg" | "wa",
): Promise<void> {
  await ctx.answerCallbackQuery();
  const msg = await ctx.editMessageText(
    `⏳ Loading countries for <b>${serviceLabel(service)}</b>...`,
    { parse_mode: "HTML" },
  );
  const msgId = typeof msg === "boolean" ? user.lastMessageId! : (msg as { message_id: number }).message_id;

  let available: Array<{ countryId: number; providers: Array<{ id: number; price: number; count: number }> }>;
  try {
    available = await getAvailableCountriesForService(service);
  } catch {
    await bot.api.editMessageText(user.telegramId, msgId, "❌ Failed to load countries. Try again.", {
      reply_markup: new InlineKeyboard().text("🔄 Retry", `svc:${service}`),
    });
    return;
  }

  if (available.length === 0) {
    await bot.api.editMessageText(user.telegramId, msgId, "😔 No numbers available for this service right now.");
    return;
  }

  const countries = available.map((a) => ({
    id: a.countryId,
    name: getCountryName(a.countryId),
    flag: getFlagEmoji(getCountryName(a.countryId)),
  }));
  countries.sort((a, b) => a.name.localeCompare(b.name));

  user.state = "select_country";
  user.stateData = { service, availableCountries: available, countries };
  user.lastMessageId = msgId;
  await user.save();

  const page = 0;
  const tp = totalPages(countries, COUNTRIES_PER_PAGE);
  await bot.api.editMessageText(
    user.telegramId,
    msgId,
    `🌍 <b>${serviceLabel(service)}</b> — Select Country (${countries.length} available):`,
    {
      parse_mode: "HTML",
      reply_markup: countryPageKeyboard(paginate(countries, page, COUNTRIES_PER_PAGE), page, tp, service),
    },
  );
}

export async function handleCountryPage(
  ctx: Context,
  user: IUser,
  service: string,
  page: number,
): Promise<void> {
  await ctx.answerCallbackQuery();
  const countries = (user.stateData["countries"] as Array<{ id: number; name: string; flag: string }>) ?? [];
  const tp = totalPages(countries, COUNTRIES_PER_PAGE);
  await ctx.editMessageReplyMarkup({
    reply_markup: countryPageKeyboard(paginate(countries, page, COUNTRIES_PER_PAGE), page, tp, service),
  });
}

export async function handleCountrySelect(
  bot: Bot,
  ctx: Context,
  user: IUser,
  service: "tg" | "wa",
  countryId: number,
): Promise<void> {
  await ctx.answerCallbackQuery();
  const available = (user.stateData["availableCountries"] as Array<{ countryId: number; providers: Array<{ id: number; price: number; count: number }> }>) ?? [];
  const countryData = available.find((a) => a.countryId === countryId);

  if (!countryData || countryData.providers.length === 0) {
    await ctx.answerCallbackQuery({ text: "No providers for this country.", show_alert: true });
    return;
  }

  const extraMargin = await getExtraMargin();
  const countryName = getCountryName(countryId);
  const flag = getFlagEmoji(countryName);
  const providers = countryData.providers.map((p, idx) => ({
    idx,
    price: p.price,
    count: p.count,
  }));

  user.state = "select_provider";
  user.stateData = { ...user.stateData, countryId, countryName, providers };
  await user.save();

  await ctx.editMessageText(
    `${flag} <b>${countryName}</b> — Choose Provider:\n\n` +
      providers
        .map(
          (p, i) =>
            `${i + 1}. Stock: <b>${p.count}</b> — Price: <b>${formatPrice(p.price + extraMargin)}</b>`,
        )
        .join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: providerKeyboard(providers, service, countryId, extraMargin),
    },
  );
}

export async function handleProviderSelect(
  bot: Bot,
  ctx: Context,
  user: IUser,
  service: "tg" | "wa",
  countryId: number,
  providerIdx: number,
): Promise<void> {
  await ctx.answerCallbackQuery();

  // Check active number limit
  const maxActive = await getMaxActiveNumbers();
  const activeCount = await ActiveNumber.countDocuments({
    telegramId: user.telegramId,
    status: "active",
  });

  if (activeCount >= maxActive) {
    const actives = await ActiveNumber.find({ telegramId: user.telegramId, status: "active" });
    const list = actives
      .map(
        (n) =>
          `• ${getFlagEmoji(n.countryName)} +${n.phoneNumber} (${serviceLabel(n.service)})`,
      )
      .join("\n");

    await ctx.editMessageText(
      `⚠️ You have <b>${activeCount}</b> active number(s) — limit is <b>${maxActive}</b>.\n\n${list}\n\nWait for OTP or cancel them first.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  // Get provider price
  const providers = (user.stateData["providers"] as Array<{ idx: number; price: number; count: number }>) ?? [];
  const provider = providers[providerIdx];
  if (!provider) {
    await ctx.answerCallbackQuery({ text: "Invalid provider.", show_alert: true });
    return;
  }

  const extraMargin = await getExtraMargin();
  const finalPrice = provider.price + extraMargin;

  // Check balance
  if (user.balance < finalPrice) {
    await ctx.editMessageText(
      `❌ <b>Insufficient Balance</b>\n\nRequired: <b>${formatPrice(finalPrice)}</b>\nYour balance: <b>${formatPrice(user.balance)}</b>\n\nPlease deposit first.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const countryName = user.stateData["countryName"] as string;
  const flag = getFlagEmoji(countryName);

  await ctx.editMessageText(
    `⏳ Purchasing <b>${serviceLabel(service)}</b> number in ${flag} <b>${countryName}</b>...`,
    { parse_mode: "HTML" },
  );

  let result: { activationId: string; phoneNumber: string };
  try {
    result = await buyNumber(service, countryId, finalPrice, providerIdx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    let text = "❌ Failed to get a number. Please try again.";
    if (msg === "NO_NUMBERS") text = "😔 No numbers available right now. Try another country or provider.";
    else if (msg === "BAD_KEY") {
      text = `⚠️ API balance finished. Please notify Admin: ${SUPPORT_USERNAME}`;
    }
    await ctx.editMessageText(text, { parse_mode: "HTML" });
    return;
  }

  // Save active number (don't deduct balance yet — deduct on OTP received)
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  const activeNumber = await ActiveNumber.create({
    telegramId: user.telegramId,
    activationId: result.activationId,
    phoneNumber: result.phoneNumber,
    countryId,
    countryName,
    service,
    providerId: providerIdx,
    price: finalPrice,
    apiPrice: provider.price,
    purchasedAt: new Date(),
    expiresAt,
    status: "active",
    balanceDeducted: false,
  });

  // Record buy activity (not spent yet — on OTP receipt)
  await recordActivity(user.telegramId, user.username, user.firstName, "buys", finalPrice, 0);

  user.state = "idle";
  user.stateData = {};
  await user.save();

  const keyboard = numberPurchasedKeyboard(service, countryId, providerIdx);
  // Phone number button — copies number only (no flag in callback data)
  const numKeyboard = new InlineKeyboard()
    .text(`${flag} +${result.phoneNumber}`, `copy_num:${result.phoneNumber}`)
    .row()
    .text("🔄 Buy again", `buyagain:${service}:${countryId}:${providerIdx}`)
    .text("❌ Cancel", `cancel_num:${result.activationId}`);

  const purchaseMsg = await ctx.editMessageText(
    `${serviceLabel(service)} — ${flag} ${countryName} ${formatPrice(finalPrice)}\n\n⏳ Waiting for OTP... (20 min)`,
    { parse_mode: "HTML", reply_markup: numKeyboard },
  );

  const purchaseMsgId = typeof purchaseMsg === "boolean"
    ? user.lastMessageId!
    : (purchaseMsg as { message_id: number }).message_id;

  activeNumber.messageId = purchaseMsgId;
  await activeNumber.save();
}

export async function handleCancelNumber(
  bot: Bot,
  ctx: Context,
  user: IUser,
  activationId: string,
): Promise<void> {
  await ctx.answerCallbackQuery();
  const activeNumber = await ActiveNumber.findOne({
    telegramId: user.telegramId,
    activationId,
    status: "active",
  });

  if (!activeNumber) {
    await ctx.editMessageText("❌ Number not found or already cancelled.");
    return;
  }

  try {
    await cancelNumber(activationId);
  } catch { /* ignore cancel errors */ }

  activeNumber.status = "cancelled";
  await activeNumber.save();

  await recordActivity(user.telegramId, user.username, user.firstName, "cancels", 0, 0);

  await ctx.editMessageText(
    `✅ Number <b>+${activeNumber.phoneNumber}</b> cancelled.`,
    { parse_mode: "HTML" },
  );
}
