import "dotenv/config";
import { bot } from "../lib/bot";

async function main() {
  const info = await bot.api.getWebhookInfo();
  console.log(JSON.stringify(info, null, 2));

  if (info.last_error_message) {
    console.error("\nLast Telegram delivery error:", info.last_error_message);
  }
  if (info.pending_update_count > 0) {
    console.log(`\nPending updates: ${info.pending_update_count}`);
  }
  if (!info.url) {
    console.log("\nNo webhook URL set — run: npm run bot:webhook");
  }

  const required = [
    "message",
    "callback_query",
    "chat_member",
    "my_chat_member",
    "chat_join_request",
  ] as const;
  const allowed = new Set(info.allowed_updates ?? []);
  const missing = required.filter((u) => !allowed.has(u));
  if (missing.length > 0) {
    console.warn(
      "\n⚠️  Webhook missing update types (inline buttons need callback_query):",
      missing.join(", "),
    );
    console.warn("Fix: npm run bot:webhook");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
