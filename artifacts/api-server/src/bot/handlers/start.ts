import { Bot, Context } from "grammy";
import { IUser } from "../models/user.js";
import { getForceJoinChannels } from "../models/botConfig.js";
import { mainMenuKeyboard, verifyJoinKeyboard } from "../keyboards.js";
import { safeDeleteMessage } from "../utils.js";

function channelLinkToName(ch: string): string {
  return ch.replace("@", "").replace("https://t.me/", "");
}

function channelLinkToUrl(ch: string): string {
  if (ch.startsWith("http")) return ch;
  return `https://t.me/${ch.replace("@", "")}`;
}

export async function checkForceJoin(
  bot: Bot,
  ctx: Context,
  user: IUser,
): Promise<boolean> {
  const channels = await getForceJoinChannels();
  if (channels.length === 0) return true;

  const notJoined: string[] = [];
  for (const ch of channels) {
    try {
      const chatId = ch.startsWith("-") ? ch : `@${ch.replace("@", "")}`;
      const member = await bot.api.getChatMember(chatId, user.telegramId);
      if (["left", "kicked"].includes(member.status)) {
        notJoined.push(ch);
      }
    } catch {
      notJoined.push(ch);
    }
  }

  if (notJoined.length === 0) return true;

  const channelList = notJoined.map((ch) => ({
    name: channelLinkToName(ch),
    link: channelLinkToUrl(ch),
  }));

  const text =
    `⚠️ <b>Join Required</b>\n\nPlease join the following channels/groups to use this bot:\n\n` +
    channelList.map((c) => `📢 <a href="${c.link}">${c.name}</a>`).join("\n") +
    `\n\nAfter joining, press <b>Verify ✅</b>`;

  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
  }

  const msg = await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: verifyJoinKeyboard(channelList),
    link_preview_options: { is_disabled: true },
  });

  user.lastMessageId = msg.message_id;
  user.state = "force_join";
  await user.save();
  return false;
}

export async function showMainMenu(
  bot: Bot,
  ctx: Context,
  user: IUser,
  text = "👋 Welcome! Choose an option:",
): Promise<void> {
  if (user.lastMessageId) {
    safeDeleteMessage(bot, user.telegramId, user.lastMessageId);
    user.lastMessageId = undefined;
  }
  user.state = "idle";
  user.stateData = {};
  await user.save();

  await ctx.reply(text, {
    reply_markup: mainMenuKeyboard(),
    parse_mode: "HTML",
  });
}
