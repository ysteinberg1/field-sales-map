import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { deleteItem } from "@/lib/monday";
import type { Pin } from "@/lib/pins";

const BLOB_PATHNAME = "pins.json";

// Only SalesRabbit-board leads can be deleted from the map — those are the
// ones created by salesmen in the field. Deals/Old Cashflow/Pipedrive are
// pulled from Monday and must never be removable here (see the popup's
// "Delete lead" button, which only renders for SalesRabbit pins).
export async function POST(request: Request) {
  const { itemId, board } = await request.json();

  if (!itemId || board !== "salesrabbit") {
    return NextResponse.json({ error: "itemId required, board must be salesrabbit" }, { status: 400 });
  }

  await deleteItem(itemId);

  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (existingBlob) {
      const cached: { pins: Pin[] } = await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json());
      const pins = cached.pins.filter((p) => !(p.board === "salesrabbit" && p.itemId === itemId));
      await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }
  } catch (err) {
    // Monday item is already deleted either way — don't fail the request
    // over the cache update. Worst case the pin lingers until next sync.
    console.error("[delete-lead] Failed to update shared pin cache:", err);
  }

  return NextResponse.json({ ok: true });
}
