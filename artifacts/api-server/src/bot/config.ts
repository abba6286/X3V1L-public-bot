export const BOT_TOKEN = process.env["BOT_TOKEN"] ?? "";
export const SMSBOWER_API_KEY = process.env["SMSBOWER_API_KEY"] ?? "";
export const ADMIN_USER_ID = Number(process.env["ADMIN_USER_ID"] ?? 0);
export const ADMIN_WALLET = process.env["ADMIN_WALLET"] ?? "";
export const BSCSCAN_API_KEY = process.env["BSCSCAN_API_KEY"] ?? "";
export const OTP_GROUP_ID = Number(process.env["OTP_GROUP_ID"] ?? 0);
export const SUPPORT_USERNAME = process.env["SUPPORT_USERNAME"] ?? "@X3V1L";
export const MONGODB_URI = process.env["MONGODB_URI"] ?? "";
export const WEBHOOK_URL = process.env["WEBHOOK_URL"] ?? "";
export const USDT_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
export const SMSBOWER_BASE = "https://smsbower.page/stubs/handler_api.php";
export const BSCSCAN_BASE = "https://api.bscscan.com/api";

export function assertConfig() {
  const required: Record<string, string> = {
    BOT_TOKEN,
    SMSBOWER_API_KEY,
    MONGODB_URI,
    ADMIN_WALLET,
    BSCSCAN_API_KEY,
  };
  for (const [key, val] of Object.entries(required)) {
    if (!val) throw new Error(`Missing required env var: ${key}`);
  }
}
