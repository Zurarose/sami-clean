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
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: [
      "message",
      "callback_query",
      "chat_member",
      "my_chat_member",
      "chat_join_request",
    ],
  });
  console.log("Webhook registered:", webhookUrl);

  const info = await bot.api.getWebhookInfo();
  console.log("Telegram reports URL:", info.url);
  if (info.last_error_message) {
    console.warn("Warning — last error:", info.last_error_message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
