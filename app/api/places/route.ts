import { NextRequest, NextResponse } from "next/server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

function isPrismaKnownError(error: unknown): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError;
}

export async function GET() {
  const places = await prisma.place.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(places);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const place = await prisma.place.create({ data: { name } });
    return NextResponse.json(place, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Place already exists or invalid" },
      { status: 409 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.place.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2025") {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete place" }, { status: 500 });
  }
}
