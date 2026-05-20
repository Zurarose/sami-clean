import { prisma } from "@/lib/prisma";
import { dayBounds, formatDisplayDate, todayKey, tomorrowKey } from "@/lib/dates";
import {
  createBot,
  displayName,
  getGroupChatId,
  mentionHtml,
} from "@/lib/telegram";

type ReminderResult = {
  sent: number;
  assignmentIds: string[];
};

async function sendRemindersForDate({
  dateKey,
  heading,
  onlyNotReminded,
  markAsReminded,
}: {
  dateKey: string;
  heading: string;
  onlyNotReminded: boolean;
  markAsReminded: boolean;
}): Promise<ReminderResult> {
  const { start, end } = dayBounds(dateKey);

  const assignments = await prisma.assignment.findMany({
    where: {
      date: { gte: start, lte: end },
      ...(onlyNotReminded ? { reminded: false } : {}),
      user: { inGroup: true },
    },
    include: { user: true, place: true },
    orderBy: { place: { name: "asc" } },
  });

  if (assignments.length === 0) {
    return { sent: 0, assignmentIds: [] };
  }

  const bot = createBot();
  const chatId = getGroupChatId();

  const lines = assignments.map((a: (typeof assignments)[number]) => {
    const name = displayName(a.user);
    return `• ${mentionHtml(a.user.telegramId, name)} — ${a.place.name}`;
  });

  const header = `🧹 <b>${heading}</b> (${formatDisplayDate(dateKey)})\n\n`;
  const text = header + lines.join("\n");

  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });

  const ids = assignments.map((a: (typeof assignments)[number]) => a.id);
  if (markAsReminded) {
    await prisma.assignment.updateMany({
      where: { id: { in: ids } },
      data: { reminded: true },
    });
  }

  return { sent: assignments.length, assignmentIds: ids };
}

export async function sendTomorrowReminders(): Promise<ReminderResult> {
  return sendRemindersForDate({
    dateKey: tomorrowKey(),
    heading: "Cleaning tomorrow",
    onlyNotReminded: true,
    markAsReminded: true,
  });
}

export async function sendTodayReminders(): Promise<ReminderResult> {
  return sendRemindersForDate({
    dateKey: todayKey(),
    heading: "Cleaning today",
    onlyNotReminded: false,
    markAsReminded: false,
  });
}

export async function sendDailyReminders(): Promise<{
  today: ReminderResult;
  tomorrow: ReminderResult;
  totalSent: number;
}> {
  const [today, tomorrow] = await Promise.all([
    sendTodayReminders(),
    sendTomorrowReminders(),
  ]);

  return {
    today,
    tomorrow,
    totalSent: today.sent + tomorrow.sent,
  };
}
