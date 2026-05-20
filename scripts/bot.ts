import "dotenv/config";
import { bot } from "../lib/bot";
import { getGroupChatId } from "../lib/telegram";

/** Local development only — production uses Vercel webhook */
console.log("Sami Clean bot (polling) — for local dev only");
console.log(`Group chat ID: ${getGroupChatId()}`);
console.log("Production: use npm run bot:webhook after deploy");

bot.start({
  allowed_updates: ["message", "chat_member", "my_chat_member"],
});
