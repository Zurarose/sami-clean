import { Bot } from "grammy";
import { getBotToken, isGroupChat } from "@/lib/telegram";
import { setUserInGroup, upsertTelegramUser } from "@/lib/users";

const ACTIVE_MEMBER_STATUSES = new Set([
  "member",
  "administrator",
  "creator",
]);

const LEFT_MEMBER_STATUSES = new Set(["left", "kicked"]);

function createBot() {
  const bot = new Bot(getBotToken());

  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const user = await upsertTelegramUser(ctx.from);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    await ctx.reply(
      `Hi ${name}! You're registered for Sami Clean.\n\n` +
        `Assignments and reminders are managed on the dashboard. ` +
        `You'll get a group mention the day before your cleaning duty.`,
    );
  });

  bot.command("chatid", async (ctx) => {
    if (ctx.chat) {
      await ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.on("chat_member", async (ctx) => {
    if (!isGroupChat(ctx.chat.id)) return;

    const member = ctx.chatMember.new_chat_member;
    if (!member.user || member.user.is_bot) return;

    if (ACTIVE_MEMBER_STATUSES.has(member.status)) {
      await upsertTelegramUser(member.user, { inGroup: true });
      return;
    }

    if (LEFT_MEMBER_STATUSES.has(member.status)) {
      await setUserInGroup(BigInt(member.user.id), false);
    }
  });

  bot.on("message:new_chat_members", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id)) return;

    for (const user of ctx.message.new_chat_members) {
      if (!user.is_bot) {
        await upsertTelegramUser(user, { inGroup: true });
      }
    }
  });

  bot.on("message", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id) || !ctx.from || ctx.from.is_bot) {
      return;
    }
    await upsertTelegramUser(ctx.from, { inGroup: true });
  });

  bot.on("message:left_chat_member", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id)) return;

    const user = ctx.message.left_chat_member;
    if (!user.is_bot) {
      await setUserInGroup(BigInt(user.id), false);
    }
  });

  return bot;
}

/** Singleton for serverless — reuse across warm invocations */
const globalForBot = globalThis as unknown as { bot?: Bot };

export const bot = globalForBot.bot ?? createBot();
globalForBot.bot = bot;
