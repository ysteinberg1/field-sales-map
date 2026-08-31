import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { BOARDS, createItem } from "@/lib/monday";
import { upsertPin } from "@/lib/pins";
import type { Pin } from "@/lib/pins";

// Landing board for new pins created from the field. Change to "deals" here
// if the "create in SalesRabbit, promote later" decision changes.
const TARGET_BOARD: keyof typeof BOARDS = "salesrabbit";

// SalesRabbit column IDs, confirmed against the live board.
const SALESRABBIT_LOCATION_COL = "location_mm6kf638"; // Dedup Location — the column the map actually reads
const SALESRABBIT_SALESMAN_COL = "color_mm4v4hed"; // Lead Owner (status). Labels: JJ, Yoel, Shragie, Chuny, Ari, Neil
const SALESRABBIT_NOTE_COL = "long_text_mm4v6hdv"; // Note
const SALESRABBIT_STATUS_COL = "color_mm4vht3r"; // Status — see STATUS_OPTIONS in FieldMap.tsx for exact labels

// New leads from the app land in their own group, separate from the
// historical SalesRabbit import sitting in "Sales Rabbit".
const SALESRABBIT_NEW_LEAD_GROUP = "group_mm6rvsa1"; // "Sales Map" group

const BLOB_PATHNAME = "pins.json";

export async function POST(request: Request) {
  const { name, lat, lng, address, salesman, note, status } = await request.json();

  if (!name || lat == null || lng == null) {
    return NextResponse.json({ error: "name, lat, lng required" }, { status: 400 });
  }

  const board = BOARDS[TARGET_BOARD];

  const columnValues: Record<string, unknown> = {
    [SALESRABBIT_LOCATION_COL]: { lat: String(lat), lng: String(lng), address: address ?? "" },
  };
  if (salesman) {
    // Status columns take { label: "<exact label text>" }, not a bare string.
    columnValues[SALESRABBIT_SALESMAN_COL] = { label: salesman };
  }
  if (note) {
    columnValues[SALESRABBIT_NOTE_COL] = { text: note };
  }
  if (status) {
    columnValues[SALESRABBIT_STATUS_COL] = { label: status };
  }

  const itemId = await createItem(board.id, name, columnValues, SALESRABBIT_NEW_LEAD_GROUP);

  // Push straight into the shared cache so every salesman sees this pin on
  // their next load, not just the one who created it (that part already
  // happens client-side) — no need to wait for the nightly sync, which
  // doesn't even touch the SalesRabbit board anymore.
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (existingBlob) {
      const cached: { pins: Pin[] } = await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json());
      const newPin: Pin = {
        board: TARGET_BOARD,
        tier: board.tier,
        itemId,
        name,
        lat,
        lng,
        address: address ?? null,
        status: status ?? null,
        stage: null,
      };
      const pins = upsertPin(cached.pins, newPin);
      await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }
  } catch (err) {
    // The Monday item is already created either way — don't fail the
    // request over the shared-cache update. Worst case it shows up for
    // everyone else at the next nightly sync instead of instantly.
    console.error("[create-deal] Failed to update shared pin cache:", err);
  }

  return NextResponse.json({ ok: true, itemId });
}
