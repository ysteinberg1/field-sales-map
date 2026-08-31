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

// Fetches all four boards. Every pin is shown, even ones that overlap at
// the same address across boards — hiding lower-tier duplicates used to
// lose real information (e.g. a Pipedrive "not qualified" note sitting at
// the same address as a Deals record), so pins are no longer collapsed.
export async function buildPinDataset(): Promise<Pin[]> {
  const boardKeys = Object.keys(BOARDS) as BoardKey[];

  const results = await Promise.all(
    boardKeys.map(async (key) => {
      const items = await fetchBoardItems(BOARDS[key].id, columnIdsFor(key));
      return items.map((item) => itemToPin(item, key)).filter((p): p is Pin => p !== null);
    })
  );

  return results.flat();
}

// Nightly job: re-fetches the *entire* Deals board (every group — Active,
// Closed Won, Lost) and replaces the "deals" slice of the cached dataset
// wholesale, leaving Old Cashflow/Pipedrive Archive/SalesRabbit exactly as
// the last sync found them. Those three boards are frozen (nothing gets
// added to them through Monday anymore — only through the app, and
// create-deal already writes straight into the shared cache for that, see
// upsertPin below), so there's nothing on them left to catch by polling.
// A full-board replace (not a merge-by-id) also correctly drops any Deals
// item that got deleted, which a group-scoped patch couldn't.
export async function buildDealsPatch(existingPins: Pin[]): Promise<Pin[]> {
  const items = await fetchBoardItems(BOARDS.deals.id, columnIdsFor("deals"));
  const freshDealsPins = items.map((item) => itemToPin(item, "deals")).filter((p): p is Pin => p !== null);

  const nonDeals = existingPins.filter((p) => p.board !== "deals");
  return [...nonDeals, ...freshDealsPins];
}

// Used by /api/create-deal so a newly created SalesRabbit lead is visible
// to every salesman immediately, not just the one who created it (that
// part already happens client-side) — no need to wait for any scheduled
// sync.
export function upsertPin(existingPins: Pin[], newPin: Pin): Pin[] {
  const withoutThisItem = existingPins.filter((p) => !(p.board === newPin.board && p.itemId === newPin.itemId));
  return [...withoutThisItem, newPin];
}
