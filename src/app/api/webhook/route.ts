import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { BOARDS, BoardKey, fetchItemDetail } from "@/lib/monday";
import { columnIdsFor, itemToPin, Pin } from "@/lib/pins";
import { logEvent } from "@/lib/activityLog";

const BLOB_PATHNAME = "pins.json";

export async function POST(request: Request) {
  const body = await request.json();

  // Monday's one-time webhook handshake — echo the challenge back.
  if (body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  const event = body.event;
  const boardId: number = event?.boardId;
  const itemId: string = String(event?.pulseId ?? event?.itemId ?? "");
  if (!boardId || !itemId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const boardKey = (Object.keys(BOARDS) as BoardKey[]).find(
    (k) => BOARDS[k].id === boardId
  );
  if (!boardKey) return NextResponse.json({ ok: true, skipped: true });

  // Fetch every column the map dataset needs (location, status/stage,
  // salesman) — not just location — so a live edit to any of those (e.g.
  // a Pipedrive stage change) shows up on the map immediately too.
  const item = await fetchItemDetail(itemId, columnIdsFor(boardKey));
  const newPin = itemToPin(item, boardKey);

  // Load current dataset
  const { blobs } = await list({ prefix: BLOB_PATHNAME });
  const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  const current: { pins: Pin[] } = existingBlob
    ? await (await fetch(existingBlob.url, { cache: "no-store" })).json()
    : { pins: [] };

  // Remove any prior entry for this item, then add the fresh one back
  // (unless it no longer has a valid location — e.g. address was cleared).
  const pins = current.pins.filter(
    (p) => !(p.board === boardKey && p.itemId === itemId)
  );
  if (newPin) pins.push(newPin);

  await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  await logEvent({ type: "webhook_update", board: boardKey, itemId, name: newPin?.name ?? null });

  return NextResponse.json({ ok: true });
}
