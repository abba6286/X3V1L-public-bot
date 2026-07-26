# Virtual Phone Number Bot

A fully automated Telegram bot that sells virtual phone numbers (Telegram `tg` and WhatsApp `wa` services) using the SMSBower API. Payments are processed via USDT/BEP-20 deposits verified on-chain through BscScan.

## Stack

- **Runtime:** Node.js 24 (TypeScript, pnpm monorepo)
- **Bot framework:** Grammy (webhook mode)
- **Database:** MongoDB via Mongoose
- **Build:** esbuild (bundles to `dist/index.mjs`)
- **Scheduler:** node-cron (expiry checks + midnight BD report)

## Artifact

The bot lives inside the **`artifacts/api-server`** Express app at the `/api` prefix.

| Route | Purpose |
|-------|---------|
| `POST /api/telegram-webhook` | Receives Telegram updates from Telegram servers |
| `GET  /api/telegram-webhook` | Health-check / confirmation |
| `POST /api/sms-webhook` | Receives OTP/SMS notifications from SMSBower |
| `GET  /api/sms-webhook` | Health-check / confirmation |

## Environment Variables / Secrets

Set via Replit Secrets (never commit these):

| Key | Description |
|-----|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `MONGODB_URI` | MongoDB connection string (Atlas or self-hosted) |
| `SMSBOWER_API_KEY` | SMSBower API key |
| `BSCSCAN_API_KEY` | BscScan API key for USDT transfer verification |
| `SESSION_SECRET` | Express session secret |

Set via Replit env vars (non-sensitive):

| Key | Description |
|-----|-------------|
| `ADMIN_USER_ID` | Telegram user ID of the admin |
| `ADMIN_WALLET` | BEP-20 wallet address for USDT deposits |
| `OTP_GROUP_ID` | Telegram group ID where OTPs are forwarded |
| `SUPPORT_USERNAME` | Support handle shown to users (e.g. @X3V1L) |

## Webhook Setup

### Telegram
The webhook is set automatically on server startup. Telegram will push updates to:
```
https://<YOUR_DOMAIN>/api/telegram-webhook
```

### SMSBower OTP Webhook
Configure this URL in your SMSBower dashboard → Webhook Settings:
```
https://<YOUR_DOMAIN>/api/sms-webhook
```
Replace `<YOUR_DOMAIN>` with your Replit dev domain or production domain.

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (builds then starts)
pnpm --filter @workspace/api-server run dev

# Type-check only
pnpm --filter @workspace/api-server run typecheck

# Build only
pnpm --filter @workspace/api-server run build
```

## Bot Features

- **Buy flow:** Service (Telegram/WhatsApp) → Country → Provider → Purchase → OTP delivery
- **Deposit flow:** Show USDT/BEP-20 wallet → Enter TxID → Verify on-chain → Credit balance
- **Balance:** View current balance + all active number purchases
- **Admin panel:** Daily reports, leaderboard, broadcast, add/remove balance, set margin
- **Auto-expiry:** Numbers auto-cancelled after 20 minutes if OTP not received
- **Midnight report:** Daily stats sent to admin at 00:00 BD time (18:00 UTC)

## User Preferences

- Grammy (not Telegraf) for the bot framework
- Balance deducted on OTP receipt, not on number purchase
- No inline session plugin — state stored in MongoDB `User.state`
- Duplicate TxID protection via unique index on `transactions` collection
