import { NextRequest, NextResponse } from "next/server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { dayBounds, toDateKey } from "@/lib/dates";
import { serializeUser } from "@/lib/users";

function isPrismaKnownError(error: unknown): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "Query ?month=YYYY-MM is required" },
      { status: 400 },
    );
  }

  const [year, mon] = month.split("-").map(Number);
  const start = new Date(year, mon - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, mon, 0, 23, 59, 59, 999);

  const assignments = await prisma.assignment.findMany({
    where: { date: { gte: start, lte: end } },
    include: { user: true, place: true },
    orderBy: [{ date: "asc" }, { place: { name: "asc" } }],
  });

  return NextResponse.json(
    assignments.map((a: (typeof assignments)[number]) => ({
      id: a.id,
      date: toDateKey(a.date),
      reminded: a.reminded,
      user: serializeUser(a.user),
      place: a.place,
    })),
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    date?: string;
    userId?: string;
    placeId?: string;
  };

  const { date: dateKey, userId, placeId } = body;
  if (!dateKey || !userId || !placeId) {
    return NextResponse.json(
      { error: "date, userId, and placeId are required" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const { start } = dayBounds(dateKey);

  const user = await prisma.telegramUser.findUnique({ where: { id: userId } });
  if (!user?.inGroup) {
    return NextResponse.json(
      { error: "User is not an active group member" },
      { status: 400 },
    );
  }
  const place = await prisma.place.findUnique({ where: { id: placeId } });
  if (!place) {
    return NextResponse.json({ error: "Place does not exist" }, { status: 400 });
  }

  try {
    const assignment = await prisma.assignment.create({
      data: {
        date: start,
        userId,
        placeId,
        reminded: false,
      },
      include: { user: true, place: true },
    });

    return NextResponse.json(
      {
        id: assignment.id,
        date: dateKey,
        reminded: assignment.reminded,
        user: serializeUser(assignment.user),
        place: assignment.place,
      },
      { status: 201 },
    );
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return NextResponse.json(
        { error: "This place already has an assignment on that date" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.assignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2025") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
