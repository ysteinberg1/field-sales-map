import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";
import { buildPinDataset, buildQuickDealsPatch } from "@/lib/pins";
import type { Pin } from "@/lib/pins";

export const maxDuration = 30;

const BLOB_PATHNAME = "pins.json";

// Nightly safety-net's little sibling: only re-fetches the Deals board's
// "Active Deals" group (new deals show up there first) and patches that
// into the last cached dataset, instead of re-scanning all four boards.
// The full weekly resync (/api/cron/resync) still covers everything else.
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
    pins = await buildQuickDealsPatch(cached.pins);
  } else {
    // No cache yet — nothing to patch, fall back to a full build.
    pins = await buildPinDataset();
  }

  await put(BLOB_PATHNAME, JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return NextResponse.json({ ok: true, count: pins.length });
}
