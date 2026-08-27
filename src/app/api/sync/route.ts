import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { buildPinDataset } from "@/lib/pins";

export const maxDuration = 60;

export async function POST() {
  const pins = await buildPinDataset();

  await put("pins.json", JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return NextResponse.json({ ok: true, count: pins.length });
}

// Convenience: allow triggering a resync from a browser tab too.
export async function GET() {
  return POST();
}
