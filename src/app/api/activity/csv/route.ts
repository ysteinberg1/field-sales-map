import { NextResponse } from "next/server";
import { readLog } from "@/lib/activityLog";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const entries = await readLog();
  const columns = ["ts", "type", "board", "itemId", "name", "salesman", "status", "address", "count"];
  const rows = [
    columns.join(","),
    ...entries
      .slice()
      .reverse()
      .map((e) => columns.map((c) => csvEscape((e as Record<string, unknown>)[c])).join(",")),
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="field-sales-map-activity.csv"',
    },
  });
}
