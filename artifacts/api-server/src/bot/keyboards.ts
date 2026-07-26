import { InlineKeyboard, Keyboard } from "grammy";

export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🛒 Buy Number")
    .row()
    .text("💰 Deposit")
    .text("💳 Balance")
    .row()
    .text("🆘 Support")
    .resized()
    .persistent();
}

export function serviceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📱 Telegram", "svc:tg")
    .text("💬 WhatsApp", "svc:wa");
}

export function countryPageKeyboard(
  countries: Array<{ id: number; name: string; flag: string }>,
  page: number,
  totalPages: number,
  service: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of countries) {
    kb.text(`${c.flag} ${c.name}`, `ctry:${service}:${c.id}`).row();
  }
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) navRow.push({ text: "⬅️ Prev", callback_data: `cpage:${service}:${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: "Next ➡️", callback_data: `cpage:${service}:${page + 1}` });
  if (navRow.length > 0) {
    for (const btn of navRow) kb.text(btn.text, btn.callback_data);
    kb.row();
  }
  kb.text("❌ Cancel", "cancel_buy");
  return kb;
}

export function providerKeyboard(
  providers: Array<{ idx: number; price: number; count: number }>,
  service: string,
  countryId: number,
  extraMargin: number,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of providers) {
    const displayPrice = p.price + extraMargin;
    kb.text(
      `Provider ${p.idx + 1} — ${p.count} pcs — $${displayPrice.toFixed(3)}`,
      `prov:${service}:${countryId}:${p.idx}`,
    ).row();
  }
  kb.text("❌ Cancel", "cancel_buy");
  return kb;
}

export function numberPurchasedKeyboard(
  service: string,
  countryId: number,
  providerId: number,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Buy again", `buyagain:${service}:${countryId}:${providerId}`)
    .text("❌ Cancel", "cancel_number");
}

export function otpKeyboard(otp: string): InlineKeyboard {
  return new InlineKeyboard().text(`📋 ${otp}`, `copy:${otp}`);
}

export function verifyJoinKeyboard(
  channels: Array<{ name: string; link: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const ch of channels) {
    kb.url(`📢 ${ch.name}`, ch.link).row();
  }
  kb.text("✅ Verify", "verify_join");
  return kb;
}

export function adminPanelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Reports", "admin:reports")
    .text("🏆 Leaderboard", "admin:leaderboard")
    .row()
    .text("💰 Extra Margin", "admin:margin")
    .text("🔢 Number Limit", "admin:limit")
    .row()
    .text("📢 Force Join", "admin:forcejoin")
    .text("📣 Broadcast", "admin:broadcast")
    .row()
    .text("👥 All Users", "admin:users");
}

export function otpGroupKeyboard(
  botUsername: string,
  telegramId: number,
): InlineKeyboard {
  return new InlineKeyboard()
    .url("🤖 Number Bot", `https://t.me/${botUsername}`)
    .url("👤 Profile", `tg://openmessage?user_id=${telegramId}`);
}
