import { BOARDS, BoardKey, fetchBoardItems, fetchGroupItems, MondayItem } from "./monday";

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

// "Active Deals" group on the Deals board — the only group anyone still
// adds to day-to-day (Old Cashflow/Pipedrive Archive/SalesRabbit are frozen
// except for map-created leads, and "Closed Won"/"Lost" on Deals don't
// change often). This id feeds the nightly quick-check.
export const ACTIVE_DEALS_GROUP_ID = "topics";

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

function itemToPin(item: MondayItem, key: BoardKey): Pin | null {
  const cfg = BOARDS[key];
  const stageCol = STAGE_COLUMN[key];
  const loc = parseLocationValue(item, cfg.locationColumnId);
  if (!loc) return null;
  const status =
    key === "salesrabbit" ? item.column_values.find((c) => c.id === SALESRABBIT_STATUS_COL)?.text ?? null : null;
  const stage = stageCol ? item.column_values.find((c) => c.id === stageCol)?.text ?? null : null;
  return {
    board: key,
    tier: cfg.tier,
    itemId: item.id,
    name: item.name,
    lat: loc.lat,
    lng: loc.lng,
    address: loc.address,
    status,
    stage,
  };
}

function columnIdsFor(key: BoardKey): string[] {
  const cfg = BOARDS[key];
  const stageCol = STAGE_COLUMN[key];
  return [cfg.locationColumnId, ...(key === "salesrabbit" ? [SALESRABBIT_STATUS_COL] : []), ...(stageCol ? [stageCol] : [])];
}

// Collapses duplicate addresses using tier precedence: Deals > Old Cashflow
// > Pipedrive > SalesRabbit — the lowest-tier pin at a given address wins,
// so a new Deals pin automatically suppresses a lower-tier duplicate
// without touching anything in Monday itself.
export function dedupePins(allPins: Pin[]): Pin[] {
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

// Fetches all four boards and collapses duplicate addresses. This is the
// full weekly rebuild — safety net for anything the nightly quick-check
// missed (renames, address edits, items moved between groups, etc.).
export async function buildPinDataset(): Promise<Pin[]> {
  const boardKeys = Object.keys(BOARDS) as BoardKey[];

  const results = await Promise.all(
    boardKeys.map(async (key) => {
      const items = await fetchBoardItems(BOARDS[key].id, columnIdsFor(key));
      return items.map((item) => itemToPin(item, key)).filter((p): p is Pin => p !== null);
    })
  );

  return dedupePins(results.flat());
}

// Nightly quick check: only re-fetches the "Active Deals" group on the
// Deals board (new deals show up here first, and it's a fraction of the
// board's items) and patches those into the previously-cached full
// dataset — so Old Cashflow/Pipedrive/SalesRabbit and Deals' own
// Won/Lost groups are left exactly as the last full sync found them,
// not wiped out by a partial fetch.
export async function buildQuickDealsPatch(existingPins: Pin[]): Promise<Pin[]> {
  const items = await fetchGroupItems(BOARDS.deals.id, ACTIVE_DEALS_GROUP_ID, columnIdsFor("deals"));
  const freshDealsPins = items.map((item) => itemToPin(item, "deals")).filter((p): p is Pin => p !== null);
  const freshIds = new Set(freshDealsPins.map((p) => p.itemId));

  const carriedOver = existingPins.filter((p) => !(p.board === "deals" && freshIds.has(p.itemId)));
  return dedupePins([...carriedOver, ...freshDealsPins]);
}
