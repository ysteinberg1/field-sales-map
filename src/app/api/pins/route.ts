import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BLOB_PATHNAME = "pins.json";

export async function GET() {
  const t0 = Date.now();

  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const t1 = Date.now();
  console.log(`[pins] list() took ${t1 - t0}ms`);

  const blob = blobs.find((b) => b.pathname === BLOB_PATHNAME);

  if (!blob) {
    return NextResponse.json(
      { error: "No pin data yet — run /api/sync once." },
      { status: 404 }
    );
  }

  const res = await fetch(blob.url, { cache: "no-store" });
  const t2 = Date.now();
  console.log(`[pins] fetch(blob.url) took ${t2 - t1}ms, status ${res.status}`);

  const data = await res.json();
  const t3 = Date.now();
  console.log(`[pins] json parse took ${t3 - t2}ms, total ${t3 - t0}ms`);

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
