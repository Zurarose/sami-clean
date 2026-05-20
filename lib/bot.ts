import { Bot } from "grammy";
import type { ChatMember } from "grammy/types";
import type { User as TgUser } from "grammy/types";
import { getBotToken, isGroupChat, mentionHtml } from "@/lib/telegram";
import { getTelegramUser, setUserInGroup, upsertTelegramUser } from "@/lib/users";

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

function isActiveMember(member: ChatMember): boolean {
  if (member.status === "restricted") {
    return member.is_member;
  }
  return ACTIVE_MEMBER_STATUSES.has(member.status);
}

function isLeftMember(member: ChatMember): boolean {
  if (member.status === "restricted") {
    return !member.is_member;
  }
  return LEFT_MEMBER_STATUSES.has(member.status);
}

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
    const isTargetGroup = ctx.chat ? isGroupChat(ctx.chat.id) : false;
    const existingUser = await getTelegramUser(BigInt(ctx.from.id));
    const user = await upsertTelegramUser(
      ctx.from,
      isTargetGroup ? { inGroup: true } : undefined,
    );
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

    console.log("[bot] /start:", {
      chatId: ctx.chat?.id,
      userId: ctx.from.id,
      firstName: ctx.from.first_name,
      isTargetGroup,
      inGroup: user.inGroup,
      isNewUser: !existingUser,
    });

    if (user.inGroup) {
      if (existingUser) {
        await ctx.reply(
          `Hi ${name}! You're already registered on the cleaning roster for this group.\n\n` +
            `You will get new assignments soon. `,
        );
        console.log("[bot] /start already registered reply sent:", ctx.from.id);
        return;
      }

      await ctx.reply(
        `Hi ${name}! You're on the cleaning roster for this group.\n\n` +
          `You will get new assignments soon. `,
      );
      console.log("[bot] /start roster reply sent:", ctx.from.id);
      return;
    }

    await ctx.reply(
      `Hi ${name}! You're registered.\n\n` +
        `To appear in the assign list, send <code>/start</code> in the ` +
        `Telegram <b>group</b> (not here in private chat).`,
      { parse_mode: "HTML" },
    );
    console.log("[bot] /start group prompt sent:", ctx.from.id);
  });

  bot.command("chatid", async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat && isGroupChat(ctx.chat.id)) {
      await upsertTelegramUser(ctx.from, { inGroup: true });
      console.log("[bot] /chatid marked user in group:", ctx.from.id);
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

    const previousMember = ctx.chatMember.old_chat_member;
    const currentMember = ctx.chatMember.new_chat_member;
    if (!currentMember.user || currentMember.user.is_bot) return;

    const becameActive = isLeftMember(previousMember) && isActiveMember(currentMember);

    if (becameActive) {
      await upsertTelegramUser(currentMember.user, { inGroup: false });
      if (shouldSendJoinPrompt(chatId, currentMember.user.id)) {
        await ctx.api.sendMessage(chatId, joinPromptText([currentMember.user]), {
          parse_mode: "HTML",
        });
        console.log("[bot] chat_member join prompt sent:", currentMember.user.id);
      } else {
        console.log("[bot] chat_member join prompt skipped:", currentMember.user.id);
      }
      console.log("[bot] chat_member joined:", currentMember.user.id, currentMember.user.first_name);
      return;
    }

    if (isLeftMember(currentMember)) {
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
      console.log(
        "[bot] new_chat_members join prompt sent:",
        usersToPrompt.map((user) => user.id),
      );
    } else {
      console.log(
        "[bot] new_chat_members join prompt skipped:",
        joined.map((user) => user.id),
      );
    }
  });

  bot.on("chat_join_request", async (ctx) => {
    const chatId = ctx.chatJoinRequest.chat.id;
    if (!isGroupChat(chatId) || ctx.chatJoinRequest.from.is_bot) return;

    const user = ctx.chatJoinRequest.from;
    await upsertTelegramUser(user, { inGroup: false });
    console.log("[bot] chat_join_request:", user.id, user.first_name);

    if (shouldSendJoinPrompt(chatId, user.id)) {
      await ctx.api.sendMessage(chatId, joinPromptText([user]), {
        parse_mode: "HTML",
      });
      console.log("[bot] chat_join_request prompt sent:", user.id);
    } else {
      console.log("[bot] chat_join_request prompt skipped:", user.id);
    }
  });

  bot.on("message", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id) || !ctx.from || ctx.from.is_bot) {
      return;
    }
    if (ctx.message.text?.startsWith("/")) {
      console.log("[bot] group command ignored by fallback:", {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        text: ctx.message.text,
      });
      return;
    }
    // Keep profile in sync; roster membership is set via /start only.
    const user = await upsertTelegramUser(ctx.from);
    console.log("[bot] group message:", {
      chatId: ctx.chat.id,
      userId: ctx.from.id,
      firstName: ctx.from.first_name,
      inGroup: user.inGroup,
    });
    if (!user.inGroup && shouldSendJoinPrompt(ctx.chat.id, ctx.from.id)) {
      await ctx.reply(joinPromptText([ctx.from]), { parse_mode: "HTML" });
      console.log("[bot] group message join prompt sent:", ctx.from.id);
    } else if (!user.inGroup) {
      console.log("[bot] group message join prompt skipped:", ctx.from.id);
    }
  });

  bot.on("message:left_chat_member", async (ctx) => {
    if (!ctx.chat || !isGroupChat(ctx.chat.id)) return;

    const user = ctx.message.left_chat_member;
    if (!user.is_bot) {
      await setUserInGroup(BigInt(user.id), false);
      console.log("[bot] left_chat_member:", user.id);
    }
  });

  return bot;
}

/** Singleton for serverless — reuse across warm invocations */
const globalForBot = globalThis as unknown as { bot?: Bot };

export const bot = globalForBot.bot ?? createBot();
globalForBot.bot = bot;
