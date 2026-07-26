import { Bot, Context } from "grammy";
import { IUser } from "../models/user.js";
import { Transaction } from "../models/transaction.js";
import { verifyUsdtDeposit } from "../services/bscscan.js";
import { ADMIN_WALLET } from "../config.js";
import { formatBalance, autoDeleteMessage } from "../utils.js";

export async function startDeposit(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<void> {
  if (user.lastMessageId) {
    try { await bot.api.deleteMessage(user.telegramId, user.lastMessageId); } catch {}
  }

  const text =
    `💰 <b>Deposit USDT</b>\n\n` +
    `Send <b>USDT on BSC (BEP-20)</b> network to:\n\n` +
    `<code>${ADMIN_WALLET}</code>\n\n` +
    `⚠️ Only send <b>USDT on BSC network</b>. Other tokens/networks will be lost.\n\n` +
    `After sending, reply with your <b>Transaction Hash (TxID)</b>.\n\n` +
    `Your current balance: <b>${formatBalance(user.balance)}</b>`;

  const msg = await ctx.reply(text, { parse_mode: "HTML" });

  user.lastMessageId = msg.message_id;
  user.state = "await_txid";
  await user.save();
}

export async function handleTxId(
  bot: Bot,
  ctx: Context,
  user: IUser,
  txId: string,
): Promise<void> {
  const trimmed = txId.trim();

  // Basic TxID format check
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    const errMsg = await ctx.reply(
      "❌ Invalid transaction hash format. Please send a valid BSC transaction hash (starts with 0x, 66 chars).",
      { parse_mode: "HTML" },
    );
    autoDeleteMessage(bot, user.telegramId, errMsg.message_id, 90_000);
    return;
  }

  // Check duplicate
  const existing = await Transaction.findOne({ txId: trimmed });
  if (existing) {
    const errMsg = await ctx.reply(
      "❌ This transaction hash has already been used. Submit a new, unused transaction.",
      { parse_mode: "HTML" },
    );
    autoDeleteMessage(bot, user.telegramId, errMsg.message_id, 90_000);
    return;
  }

  const verifyMsg = await ctx.reply("🔍 Verifying transaction on BSC blockchain...", { parse_mode: "HTML" });

  const result = await verifyUsdtDeposit(trimmed);

  if (!result.valid) {
    await bot.api.editMessageText(
      user.telegramId,
      verifyMsg.message_id,
      `❌ <b>Verification Failed</b>\n\n${result.error}`,
      { parse_mode: "HTML" },
    );
    autoDeleteMessage(bot, user.telegramId, verifyMsg.message_id, 120_000);
    return;
  }

  // Record transaction (prevent reuse)
  await Transaction.create({
    txId: trimmed,
    telegramId: user.telegramId,
    amount: result.amount,
    status: "confirmed",
  });

  // Atomic balance update
  const { User } = await import("../models/user.js");
  await User.updateOne(
    { telegramId: user.telegramId },
    { $inc: { balance: result.amount } },
  );

  user.state = "idle";
  user.stateData = {};
  await user.save();

  const newBalance = user.balance + result.amount;

  await bot.api.editMessageText(
    user.telegramId,
    verifyMsg.message_id,
    `✅ <b>Deposit Confirmed!</b>\n\nAmount: <b>+$${result.amount.toFixed(4)} USDT</b>\nNew Balance: <b>${formatBalance(newBalance)}</b>\n\nThank you!`,
    { parse_mode: "HTML" },
  );
}
