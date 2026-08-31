import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { BOARDS, BoardKey, fetchItemDetail } from "@/lib/monday";
import { Pin } from "@/lib/pins";

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

  const cfg = BOARDS[boardKey];
  const item = await fetchItemDetail(itemId, [cfg.locationColumnId]);
  const locCol = item.column_values.find((c) => c.id === cfg.locationColumnId);

  // Load current dataset
  const { blobs } = await list({ prefix: BLOB_PATHNAME });
  const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  const current: { pins: Pin[] } = existingBlob
    ? await (await fetch(existingBlob.url, { cache: "no-store" })).json()
    : { pins: [] };

  // Remove any prior entry for this item
  let pins = current.pins.filter(
    (p) => !(p.board === boardKey && p.itemId === itemId)
  );

  if (locCol?.value) {
    try {
      const parsed = JSON.parse(locCol.value);
      const lat = parseFloat(parsed.lat);
      const lng = parseFloat(parsed.lng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const newPin: Pin = {
          board: boardKey,
          tier: cfg.tier,
          itemId,
          name: item.name,
          lat,
          lng,
          address: parsed.address ?? null,
          status: null,
          stage: null,
        };
        pins.push(newPin);
      }
    } catch {
      // no valid location — item removed from the map
    }
  }

  await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return NextResponse.json({ ok: true });
}
