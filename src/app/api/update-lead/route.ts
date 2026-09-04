import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { BOARDS, updateItem } from "@/lib/monday";
import type { Pin } from "@/lib/pins";
import { logEvent } from "@/lib/activityLog";

// Same restriction as delete-lead: only SalesRabbit leads (the ones
// salesmen create in the field) can be edited from the map. Deals is
// worked live in Monday and Old Cashflow/Pipedrive Archive are frozen
// imports — the popup only renders an Edit button for SalesRabbit pins,
// and this guard is the server-side half of that rule.
const SALESRABBIT_NOTE_COL = "long_text_mm4v6hdv";
const SALESRABBIT_STATUS_COL = "color_mm4vht3r";
const SALESRABBIT_LOCATION_COL = BOARDS.salesrabbit.locationColumnId;

const BLOB_PATHNAME = "pins.json";

export async function POST(request: Request) {
  const { itemId, board, name, address, note, status, lat, lng } = await request.json();

  if (!itemId || board !== "salesrabbit") {
    return NextResponse.json({ error: "itemId required, board must be salesrabbit" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // Lead Owner is deliberately not touched — editing someone's lead
  // shouldn't quietly reassign it to whoever did the editing.
  const columnValues: Record<string, unknown> = { name };
  columnValues[SALESRABBIT_NOTE_COL] = { text: note ?? "" };
  if (status) {
    columnValues[SALESRABBIT_STATUS_COL] = { label: status };
  }
  // The pin doesn't move on an edit — lat/lng are written back unchanged
  // so that correcting the address text doesn't blank out the location
  // column (Monday replaces the whole value, it can't patch one field).
  if (lat != null && lng != null) {
    columnValues[SALESRABBIT_LOCATION_COL] = {
      lat: String(lat),
      lng: String(lng),
      address: address ?? "",
    };
  }

  await updateItem(BOARDS.salesrabbit.id, itemId, columnValues);

  await logEvent({
    type: "lead_edited",
    itemId,
    board,
    name,
    status: status ?? null,
    address: address ?? null,
  });

  // Mirror the edit into the shared pin cache so other salesmen see the
  // new name/status without waiting for a sync — same best-effort
  // treatment as create-deal: the Monday write already succeeded, so a
  // cache failure must not fail the request.
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (existingBlob) {
      const cached: { pins: Pin[] } = await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json());
      const pins = cached.pins.map((p) =>
        p.board === "salesrabbit" && p.itemId === itemId
          ? { ...p, name, address: address ?? null, status: status ?? null }
          : p
      );
      await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }
  } catch (err) {
    console.error("[update-lead] Failed to update shared pin cache:", err);
  }

  return NextResponse.json({ ok: true });
}
