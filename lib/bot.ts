import { Bot } from "grammy";
import type { User as TgUser } from "grammy/types";
import { getBotToken, isGroupChat, mentionHtml } from "@/lib/telegram";
import { setUserInGroup, upsertTelegramUser } from "@/lib/users";

function joinPromptText(users: TgUser[]): string {
  const names = users
    .filter((u) => !u.is_bot)
    .map((u) =>
      mentionHtml(
        BigInt(u.id),
        [u.first_name, u.last_name].filter(Boolean).join(" ") || "there",
      ),
    )
    .join(", ");

  return (
    `Welcome ${names}!\n\n` +
    `Please send <code>/start</code> here in the group to join the cleaning roster.`
  );
}

const ACTIVE_MEMBER_STATUSES = new Set([
  "member",
  "administrator",
  "creator",
]);

const LEFT_MEMBER_STATUSES = new Set(["left", "kicked"]);
const JOIN_PROMPT_TTL_MS = 60_000;
const recentJoinPrompts = new Map<string, number>();

function shouldSendJoinPrompt(chatId: number, userId: number): boolean {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const lastSentAt = recentJoinPrompts.get(key);

  if (lastSentAt !== undefined && now - lastSentAt < JOIN_PROMPT_TTL_MS) {
    return false;
  }

  recentJoinPrompts.set(key, now);

  for (const [entryKey, sentAt] of recentJoinPrompts) {
    if (now - sentAt >= JOIN_PROMPT_TTL_MS) {
      recentJoinPrompts.delete(entryKey);
    }
  }

  return true;
}

function createBot() {
  const bot = new Bot(getBotToken());

  bot.catch((err) => {
    console.error("[bot]", err);
  });

  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const inGroup = ctx.chat ? isGroupChat(ctx.chat.id) : false;
    const user = await upsertTelegramUser(ctx.from, { inGroup });
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

    if (inGroup) {
      await ctx.reply(
        `Hi ${name}! You're on the cleaning roster for this group.\n\n` +
          `You will get new assignments soon. `
      );
      return;
    }

    await ctx.reply(
      `Hi ${name}! You're registered.\n\n` +
        `To appear in the assign list, send <code>/start</code> in the ` +
        `Telegram <b>group</b> (not here in private chat).`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("chatid", async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat && isGroupChat(ctx.chat.id)) {
      await upsertTelegramUser(ctx.from, { inGroup: true });
    }
    if (ctx.chat) {
      await ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.on("chat_member", async (ctx) => {
    const chatId = ctx.chatMember.chat.id;
    if (!isGroupChat(chatId)) return;

    const previousStatus = ctx.chatMember.old_chat_member.status;
    const currentMember = ctx.chatMember.new_chat_member;
    if (!currentMember.user || currentMember.user.is_bot) return;

    const becameActive =
      LEFT_MEMBER_STATUSES.has(previousStatus) &&
      ACTIVE_MEMBER_STATUSES.has(currentMember.status);

    if (becameActive) {
      await upsertTelegramUser(currentMember.user, { inGroup: false });
      if (shouldSendJoinPrompt(chatId, currentMember.user.id)) {
        await ctx.api.sendMessage(chatId, joinPromptText([currentMember.user]), {
          parse_mode: "HTML",
        });
      }
      console.log("[bot] chat_member joined:", currentMember.user.id, currentMember.user.first_name);
      return;
    }

    if (LEFT_MEMBER_STATUSES.has(currentMember.status)) {
      await setUserInGroup(BigInt(currentMember.user.id), false);
      console.log("[bot] chat_member left:", currentMember.user.id);
    }
  });

  bot.on("message:new_chat_members", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id)) return;

    const joined = ctx.message.new_chat_members.filter((u) => !u.is_bot);
    if (joined.length === 0) return;

    for (const user of joined) {
      await upsertTelegramUser(user, { inGroup: false });
      console.log("[bot] new_chat_members:", user.id, user.first_name);
    }

    const usersToPrompt = joined.filter((user) => shouldSendJoinPrompt(ctx.chat.id, user.id));
    if (usersToPrompt.length > 0) {
      await ctx.reply(joinPromptText(usersToPrompt), { parse_mode: "HTML" });
    }
  });

  bot.on("message", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id) || !ctx.from || ctx.from.is_bot) {
      return;
    }
    // Keep profile in sync; roster membership is set via /start only.
    await upsertTelegramUser(ctx.from);
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
