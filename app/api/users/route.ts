import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/users";

export async function GET() {
  const users = await prisma.telegramUser.findMany({
    where: { inGroup: true },
    orderBy: { firstName: "asc" },
  });
  return NextResponse.json(users.map(serializeUser));
}
