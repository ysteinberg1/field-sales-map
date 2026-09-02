import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { buildPinDataset, buildDealsPatch } from "@/lib/pins";
import type { Pin } from "@/lib/pins";
import { logEvent } from "@/lib/activityLog";

export const maxDuration = 30;

const BLOB_PATHNAME = "pins.json";

// The only scheduled sync this app runs. Deals is the one board still
// worked day-to-day, so it gets a full re-fetch (all groups) every night —
// a full deals-board pull takes well under a minute, so there's no reason
// to only check a subset. Old Cashflow/Pipedrive Archive/SalesRabbit are
// frozen (nothing added through Monday anymore) and get left exactly as
// the last sync found them; new SalesRabbit leads from the app reach the
// shared cache instantly via /api/create-deal (see upsertPin in
// src/lib/pins.ts), not through this job.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const existingBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME);

  let pins: Pin[];
  if (existingBlob) {
    const cached: { pins: Pin[] } = await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json());
    pins = await buildDealsPatch(cached.pins);
  } else {
    // No cache yet — nothing to patch, fall back to a full build.
    pins = await buildPinDataset();
  }

  await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  await logEvent({ type: "nightly_sync", count: pins.length });

  return NextResponse.json({ ok: true, count: pins.length });
}
