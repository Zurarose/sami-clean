import { webhookCallback } from "grammy/web";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

export const POST = webhookCallback(bot, "std/http", {
  secretToken: secret,
});
