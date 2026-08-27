import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";

const BLOB_PATHNAME = "pins.json";

export async function GET() {
  const { blobs } = await list({ prefix: BLOB_PATHNAME });
  const blob = blobs.find((b) => b.pathname === BLOB_PATHNAME);

  if (!blob) {
    return NextResponse.json(
      { error: "No pin data yet — run /api/sync once." },
      { status: 404 }
    );
  }

  const res = await fetch(blob.url, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
