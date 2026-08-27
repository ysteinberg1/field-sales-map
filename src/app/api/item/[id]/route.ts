import { NextResponse } from "next/server";
import { BoardKey, DETAIL_COLUMNS, fetchItemDetail } from "@/lib/monday";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const board = searchParams.get("board") as BoardKey | null;

  if (!board || !DETAIL_COLUMNS[board]) {
    return NextResponse.json({ error: "valid ?board= query param required" }, { status: 400 });
  }

  const item = await fetchItemDetail(id, DETAIL_COLUMNS[board]);

  const details: Record<string, string | null> = {};
  for (const cv of item.column_values) {
    details[cv.id] = cv.text;
  }

  return NextResponse.json({ id: item.id, name: item.name, details });
}
