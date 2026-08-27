import { BOARDS, BoardKey, fetchBoardItems, MondayItem } from "./monday";

export interface Pin {
  board: BoardKey;
  tier: number;
  itemId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

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
      const items = await fetchBoardItems(cfg.id, [cfg.locationColumnId]);
      const pins: Pin[] = [];
      for (const item of items) {
        const loc = parseLocationValue(item, cfg.locationColumnId);
        if (!loc) continue;
        pins.push({
          board: key,
          tier: cfg.tier,
          itemId: item.id,
          name: item.name,
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
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
