import { Bot } from "grammy";

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
}

export function getGroupChatId(): string {
  const id = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!id) {
    throw new Error("TELEGRAM_GROUP_CHAT_ID is not set");
  }
  return id;
}

export function isGroupChat(chatId: number): boolean {
  return String(chatId) === getGroupChatId();
}

export function createBot(): Bot {
  return new Bot(getBotToken());
}

/** HTML mention for users without @username */
export function mentionHtml(
  telegramId: bigint,
  displayName: string,
): string {
  const safeName = displayName.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<a href="tg://user?id=${telegramId}">${safeName}</a>`;
}

export function displayName(user: {
  firstName: string;
  lastName?: string | null;
  username?: string | null;
}): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.username ? `@${user.username}` : full || "Member";
}
