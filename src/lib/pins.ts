import { BOARDS, BoardKey, fetchBoardItems, MondayItem } from "./monday";

export interface Pin {
  board: BoardKey;
  tier: number;
  itemId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  status: string | null;
  stage: string | null;
}

// Status column on the SalesRabbit board — labels feed the status-icon set
// in src/lib/statusIcons.ts. Only this board carries a per-lead status.
const SALESRABBIT_STATUS_COL = "color_mm4vht3r";

// Stage/status columns on Deals and Pipedrive Archive — both have a "Won"
// label (confirmed live), which feeds the source-badge set in
// src/lib/sourceIcons.ts (Pipedrive/Monday logo, or a green check if Won).
const STAGE_COLUMN: Partial<Record<BoardKey, string>> = {
  deals: "deal_stage",
  pipedrive: "status",
};

function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  let a = addr.toLowerCase();
  a = a.replace(/[^\w\s]/g, "");
  a = a.replace(/\b(suite|ste|unit|apt|building|bldg)\s*\w*\b/g, "");
  a = a.replace(/\s+/g, " ").trim();
  return a || null;
}

function parseLocationValue(
  item: MondayItem,
  locationColumnId: string
): { lat: number; lng: number; address: string | null } | null {
  const col = item.column_values.find((c) => c.id === locationColumnId);
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    const lat = parseFloat(parsed.lat);
    const lng = parseFloat(parsed.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, address: parsed.address ?? null };
  } catch {
    return null;
  }
}

// Fetches all four boards and collapses duplicate addresses using tier
// precedence: Deals > Old Cashflow > Pipedrive > SalesRabbit.
export async function buildPinDataset(): Promise<Pin[]> {
  const boardKeys = Object.keys(BOARDS) as BoardKey[];

  const results = await Promise.all(
    boardKeys.map(async (key) => {
      const cfg = BOARDS[key];
      const stageCol = STAGE_COLUMN[key];
      const columnIds = [
        cfg.locationColumnId,
        ...(key === "salesrabbit" ? [SALESRABBIT_STATUS_COL] : []),
        ...(stageCol ? [stageCol] : []),
      ];
      const items = await fetchBoardItems(cfg.id, columnIds);
      const pins: Pin[] = [];
      for (const item of items) {
        const loc = parseLocationValue(item, cfg.locationColumnId);
        if (!loc) continue;
        const status =
          key === "salesrabbit"
            ? item.column_values.find((c) => c.id === SALESRABBIT_STATUS_COL)?.text ?? null
            : null;
        const stage = stageCol ? item.column_values.find((c) => c.id === stageCol)?.text ?? null : null;
        pins.push({
          board: key,
          tier: cfg.tier,
          itemId: item.id,
          name: item.name,
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
          status,
          stage,
        });
      }
      return pins;
    })
  );

  const allPins = results.flat();

  const best = new Map<string, Pin>();
  for (const pin of allPins) {
    const key = normalizeAddress(pin.address) ?? `${pin.lat.toFixed(4)},${pin.lng.toFixed(4)}`;
    const existing = best.get(key);
    if (!existing || pin.tier < existing.tier) {
      best.set(key, pin);
    }
  }

  return Array.from(best.values());
}
