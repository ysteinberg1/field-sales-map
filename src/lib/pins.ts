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

// Nightly job: re-fetches the *entire* Deals board (every group — Active,
// Closed Won, Lost) and replaces the "deals" slice of the cached dataset
// wholesale, leaving Old Cashflow/Pipedrive Archive/SalesRabbit exactly as
// the last sync found them. Those three boards are frozen (nothing gets
// added to them through Monday anymore — only through the app, and
// create-deal already writes straight into the shared cache for that, see
// upsertPin below), so there's nothing on them left to catch by polling.
// A full-board replace (not a merge-by-id) also correctly drops any Deals
// item that got deleted or whose address changed enough to dedupe
// differently, which a group-scoped patch couldn't.
export async function buildDealsPatch(existingPins: Pin[]): Promise<Pin[]> {
  const items = await fetchBoardItems(BOARDS.deals.id, columnIdsFor("deals"));
  const freshDealsPins = items.map((item) => itemToPin(item, "deals")).filter((p): p is Pin => p !== null);

  const nonDeals = existingPins.filter((p) => p.board !== "deals");
  return dedupePins([...nonDeals, ...freshDealsPins]);
}

// Used by /api/create-deal so a newly created SalesRabbit lead is visible
// to every salesman immediately, not just the one who created it (that
// part already happens client-side) — no need to wait for any scheduled
// sync. Dedup still applies: if this address is already covered by a
// higher-tier pin, the new one won't win, matching how a real sync would
// resolve it.
export function upsertPin(existingPins: Pin[], newPin: Pin): Pin[] {
  const withoutThisItem = existingPins.filter((p) => !(p.board === newPin.board && p.itemId === newPin.itemId));
  return dedupePins([...withoutThisItem, newPin]);
}
