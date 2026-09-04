import { readLog } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  lead_created: "Lead created",
  lead_edited: "Lead edited",
  lead_deleted: "Lead deleted",
  manual_sync: "Manual sync",
  nightly_sync: "Nightly sync",
  webhook_update: "Monday edit",
};

const TYPE_COLORS: Record<string, string> = {
  lead_created: "#e9f1e1",
  lead_edited: "#e8eef5",
  lead_deleted: "#f7e6e4",
  manual_sync: "#e5eef6",
  nightly_sync: "#e5eef6",
  webhook_update: "#eae8e2",
};

function summarize(e: Awaited<ReturnType<typeof readLog>>[number]): string {
  switch (e.type) {
    case "lead_created":
      return `${e.name ?? "—"}${e.salesman ? ` · ${e.salesman}` : ""}${e.status ? ` · ${e.status}` : ""}`;
    case "lead_edited":
      return `${e.name ?? "—"}${e.status ? ` · ${e.status}` : ""}`;
    case "lead_deleted":
      return `Item ${e.itemId ?? "—"}`;
    case "manual_sync":
    case "nightly_sync":
      return `${e.count ?? "—"} pins synced`;
    case "webhook_update":
      return `${e.name ?? "—"} (${e.board ?? "—"})`;
    default:
      return "";
  }
}

export default async function ActivityPage() {
  const entries = (await readLog()).slice().reverse();

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Field Sales Map — Activity Log</h1>
        <a
          href="/api/activity/csv"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "white",
            background: "#2f6b1f",
            padding: "8px 14px",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          Download CSV
        </a>
      </div>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        {entries.length} events logged. Newest first.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px 6px" }}>When</th>
            <th style={{ padding: "8px 6px" }}>Event</th>
            <th style={{ padding: "8px 6px" }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 6px", color: "#666", whiteSpace: "nowrap" }}>
                {new Date(e.ts).toLocaleString("en-US")}
              </td>
              <td style={{ padding: "8px 6px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: TYPE_COLORS[e.type] ?? "#eee",
                    fontSize: 11.5,
                    fontWeight: 500,
                  }}
                >
                  {TYPE_LABELS[e.type] ?? e.type}
                </span>
              </td>
              <td style={{ padding: "8px 6px" }}>{summarize(e)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: "20px 6px", color: "#999", textAlign: "center" }}>
                No activity logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
