import { webhookCallback } from "grammy/web";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

const handleUpdate = webhookCallback(bot, "std/http", {
  secretToken: secret,
});

export async function POST(request: Request) {
  try {
    return await handleUpdate(request);
  } catch (error) {
    console.error("[webhook]", error);
    throw error;
  }
}
