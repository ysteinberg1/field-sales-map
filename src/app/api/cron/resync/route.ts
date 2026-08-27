import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { buildPinDataset } from "@/lib/pins";

export const maxDuration = 60;

// Vercel Cron calls this on the schedule set in vercel.json.
// This is the safety net, not the primary update path — normal updates
// happen instantly via /api/webhook. This just catches anything a
// missed webhook or bulk edit left behind.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const pins = await buildPinDataset();
  await put("pins.json", JSON.stringify({ pins, syncedAt: new Date().toISOString() }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return NextResponse.json({ ok: true, count: pins.length });
}
