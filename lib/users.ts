import { prisma } from "@/lib/prisma";
import type { User as TgUser } from "grammy/types";

type UpsertOptions = {
  inGroup?: boolean;
};

export async function upsertTelegramUser(from: TgUser, options?: UpsertOptions) {
  const profile = {
    username: from.username ?? null,
    firstName: from.first_name,
    lastName: from.last_name ?? null,
  };

  return prisma.telegramUser.upsert({
    where: { telegramId: BigInt(from.id) },
    create: {
      telegramId: BigInt(from.id),
      ...profile,
      inGroup: options?.inGroup ?? false,
    },
    update: {
      ...profile,
      ...(options?.inGroup !== undefined ? { inGroup: options.inGroup } : {}),
    },
  });
}

export async function setUserInGroup(telegramId: bigint, inGroup: boolean) {
  return prisma.telegramUser.updateMany({
    where: { telegramId },
    data: { inGroup },
  });
}

export function serializeUser(user: {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    label: [user.firstName, user.lastName].filter(Boolean).join(" "),
  };
}
