import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { ChatMember } from "grammy/types";
import type { User as TgUser } from "grammy/types";
import { getBotToken, isGroupChat, mentionHtml } from "@/lib/telegram";
import { getTelegramUser, setUserInGroup, upsertTelegramUser } from "@/lib/users";

const HTML = { parse_mode: "HTML" as const };

const JOIN_ROSTER_CALLBACK = "join_roster";

function joinPromptKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Join the roster", JOIN_ROSTER_CALLBACK);
}

function joinMessageOptions() {
  return {
    ...HTML,
    reply_markup: joinPromptKeyboard(),
  };
}

function formatUserNames(users: TgUser[]): string {
  return users
    .filter((u) => !u.is_bot)
    .map((u) =>
      mentionHtml(
        BigInt(u.id),
        [u.first_name, u.last_name].filter(Boolean).join(" ") || "there",
      ),
    )
    .join(", ");
}

function joinPromptText(users: TgUser[]): string {
  const names = formatUserNames(users);

  return (
    `👋 <b>Welcome, ${names}!</b>\n\n` +
    `You're in the cleaning group — tap below to join the roster and get assignments.\n\n` +
    `Or send <code>/start</code> in this chat.`
  );
}

function rosterJoinedText(user: TgUser): string {
  const name = mentionHtml(
    BigInt(user.id),
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "there",
  );

  return (
    `✅ <b>You're on the roster!</b>\n\n` +
    `Hi, ${name}! You're registered for cleaning duty.\n\n` +
    `📅 You'll get a ping when it's your turn to clean.`
  );
}

function rosterAlreadyJoinedText(user: TgUser): string {
  const name = mentionHtml(
    BigInt(user.id),
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "there",
  );

  return (
    `ℹ️ <b>Already on the roster</b>\n\n` +
    `${name}, you're all set — no need to sign up again.`
  );
}

type JoinRosterResult = "joined" | "already" | false;

async function handleJoinRoster(ctx: Context): Promise<JoinRosterResult> {
  if (!ctx.from) return false;
  const chat = ctx.chat;
  if (!chat || !isGroupChat(chat.id)) return false;

  const existingUser = await getTelegramUser(BigInt(ctx.from.id));
  const alreadyOnRoster = existingUser?.inGroup === true;
  const user = await upsertTelegramUser(ctx.from, { inGroup: true });

  console.log("[bot] join roster:", {
    chatId: chat.id,
    userId: ctx.from.id,
    firstName: ctx.from.first_name,
    inGroup: user.inGroup,
    isNewUser: !existingUser,
    alreadyOnRoster,
  });

  const text = alreadyOnRoster
    ? rosterAlreadyJoinedText(ctx.from)
    : rosterJoinedText(ctx.from);

  await ctx.reply(text, HTML);
  return alreadyOnRoster ? "already" : "joined";
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

    console.log("[bot] /start:", {
      chatId: ctx.chat?.id,
      userId: ctx.from.id,
      firstName: ctx.from.first_name,
      isTargetGroup,
    });

    if (isTargetGroup) {
      await handleJoinRoster(ctx);
      console.log("[bot] /start group reply sent:", ctx.from.id);
      return;
    }

    await upsertTelegramUser(ctx.from);
  });

  bot.callbackQuery(JOIN_ROSTER_CALLBACK, async (ctx) => {
    if (!ctx.from) return;

    const chat = ctx.chat;
    if (!chat || !isGroupChat(chat.id)) {
      await ctx.answerCallbackQuery({
        text: "Open the cleaning group and tap the button there.",
        show_alert: true,
      });
      return;
    }

    const result = await handleJoinRoster(ctx);
    if (result === "joined") {
      await ctx.answerCallbackQuery({ text: "You're on the roster! 🎉" });
    } else if (result === "already") {
      await ctx.answerCallbackQuery({ text: "You're already on the roster." });
    } else {
      await ctx.answerCallbackQuery();
    }
  });

  bot.command("chatid", async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat && isGroupChat(ctx.chat.id)) {
      await upsertTelegramUser(ctx.from, { inGroup: true });
      console.log("[bot] /chatid marked user in group:", ctx.from.id);
    }
    if (ctx.chat) {
      await ctx.reply(
        `🆔 <b>Chat ID</b>\n\n<code>${ctx.chat.id}</code>`,
        HTML,
      );
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
        await ctx.api.sendMessage(
          chatId,
          joinPromptText([currentMember.user]),
          joinMessageOptions(),
        );
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
      await ctx.reply(joinPromptText(usersToPrompt), joinMessageOptions());
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
      await ctx.api.sendMessage(chatId, joinPromptText([user]), joinMessageOptions());
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
      await ctx.reply(joinPromptText([ctx.from]), joinMessageOptions());
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
