import { list, put } from "@vercel/blob";

const LOG_PATHNAME = "activity-log.json";
const MAX_ENTRIES = 5000; // bounds blob size — oldest entries drop off past this

export interface LogEntry {
  ts: string;
  type:
    | "lead_created"
    | "lead_deleted"
    | "manual_sync"
    | "nightly_sync"
    | "webhook_update";
  [key: string]: unknown;
}

// Appends one entry to the shared activity log blob. Best-effort: never
// throws, and never blocks the caller's real work — a lost log entry from
// a rare concurrent-write race is an acceptable tradeoff for a lightweight
// visibility tool, not something worth a real database over.
export async function logEvent(entry: Omit<LogEntry, "ts">): Promise<void> {
  try {
    const { blobs } = await list({ prefix: LOG_PATHNAME, limit: 1 });
    const existingBlob = blobs.find((b) => b.pathname === LOG_PATHNAME);
    const current: { entries: LogEntry[] } = existingBlob
      ? await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json())
      : { entries: [] };

    const entries = [...current.entries, { ts: new Date().toISOString(), ...entry }].slice(-MAX_ENTRIES);

    await put(LOG_PATHNAME, JSON.stringify({ entries }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    console.error("[activity-log] Failed to log event:", err);
  }
}

export async function readLog(): Promise<LogEntry[]> {
  const { blobs } = await list({ prefix: LOG_PATHNAME, limit: 1 });
  const existingBlob = blobs.find((b) => b.pathname === LOG_PATHNAME);
  if (!existingBlob) return [];
  const current: { entries: LogEntry[] } = await fetch(existingBlob.url, { cache: "no-store" }).then((r) => r.json());
  return current.entries;
}
