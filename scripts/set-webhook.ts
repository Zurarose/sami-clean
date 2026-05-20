import "dotenv/config";
import { bot } from "../lib/bot";

const baseUrl = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!baseUrl) {
  console.error("Set WEBHOOK_BASE_URL to your public app URL, e.g. https://your-app.vercel.app");
  process.exit(1);
}

if (!secret) {
  console.error("Set TELEGRAM_WEBHOOK_SECRET (random string, same as on Vercel)");
  process.exit(1);
}

const webhookUrl = `${baseUrl}/api/telegram/webhook`;

async function main() {
  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ["message", "chat_member", "my_chat_member"],
  });
  console.log("Webhook registered:", webhookUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
