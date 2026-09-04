// Monday.com GraphQL client and board/column registry for the field sales map.
// Token lives server-side only (process.env.MONDAY_API_TOKEN) — never sent to the client.

const MONDAY_API_URL = "https://api.monday.com/v2";

export type BoardKey = "deals" | "old_cashflow" | "pipedrive" | "salesrabbit";

export interface BoardConfig {
  id: number;
  locationColumnId: string;
  tier: number; // lower tier wins when the same address appears on multiple boards
}

// Every board uses its raw Location column — pins are no longer collapsed
// across boards by address (see pins.ts), so the "Dedup Location" columns
// (cleaned coordinates from an earlier dedup pass) aren't needed for hiding
// duplicates anymore. `tier` is kept only as metadata on the Pin.
export const BOARDS: Record<BoardKey, BoardConfig> = {
  deals: { id: 1558281108, locationColumnId: "location_mkv04x3y", tier: 0 },
  old_cashflow: { id: 5102612766, locationColumnId: "location_mm6gzddh", tier: 1 },
  pipedrive: { id: 5102614839, locationColumnId: "location_mm6g6z07", tier: 2 },
  salesrabbit: { id: 5099562913, locationColumnId: "location_mm6g8ayt", tier: 3 },
};

// Columns to show in the tap-to-view popup, per board — confirmed with Yoel.
// Fetched live per-tap, not cached in the pins.json blob.
export const DETAIL_COLUMNS: Record<BoardKey, string[]> = {
  salesrabbit: [
    "color_mm4v4hed", // Lead Owner
    "color_mm4vht3r", // Status
    "long_text_mm4v6hdv", // Note
    "date_mm6mgd2r", // Created
  ],
  pipedrive: [
    "status", // Stage
    "color_mm6dw3r2", // Salesman
    "date4", // Deal Created
    "date_mm6d9hje", // Won Date
    "text_mm6ddgyv", // Address
  ],
  old_cashflow: [
    "text_mm6dbpxy", // Address
    "color_mm6d1vdk", // Salesman
    "date_mm6drq5j", // Sales Date (install date, not a creation date)
  ],
  deals: [
    "color_mkv0qrwq", // Salesman
    "deal_stage", // Stage
    "long_text_mm6khzqt", // Sales notes
    "date_mkv0gff1", // Creation date
    "date_mkv0sgxs", // Won Date
  ],
};

// Per-board popup styling/metadata for the redesigned lead popup. Column
// ids here are also present in DETAIL_COLUMNS above and get pulled out of
// the generic field list in the popup (rendered specially instead): the
// header date, the Won Date pill, and the salesman/owner (shown once in
// the footer, not duplicated as a body row).
export const BOARD_META: Record<
  BoardKey,
  {
    label: string;
    color: string;
    bg: string;
    text: string;
    headerDateCol: string | null;
    wonDateCol: string | null;
    stageCol: string | null;
    salesmanCol: string;
  }
> = {
  deals: {
    label: "Monday Deals",
    color: "#4c7a2e",
    bg: "#e9f1e1",
    text: "#294617",
    headerDateCol: "date_mkv0gff1",
    wonDateCol: "date_mkv0sgxs",
    stageCol: "deal_stage",
    salesmanCol: "color_mkv0qrwq",
  },
  old_cashflow: {
    label: "Old Cashflow",
    color: "#b23b34",
    bg: "#f7e6e4",
    text: "#6b201b",
    headerDateCol: null,
    wonDateCol: null,
    stageCol: null,
    salesmanCol: "color_mm6d1vdk",
  },
  pipedrive: {
    label: "Pipedrive",
    color: "#57544d",
    bg: "#eae8e2",
    text: "#302e29",
    headerDateCol: "date4",
    wonDateCol: "date_mm6d9hje",
    stageCol: "status",
    salesmanCol: "color_mm6dw3r2",
  },
  salesrabbit: {
    label: "SalesRabbit",
    color: "#2f6fa8",
    bg: "#e5eef6",
    text: "#1a3c56",
    headerDateCol: "date_mm6mgd2r",
    wonDateCol: null,
    stageCol: null,
    salesmanCol: "color_mm4v4hed",
  },
};

interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

async function mondayGraphQL<T>(query: string): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is not set");

  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query }),
  });

  const body = await res.json();
  if (body.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(body.errors)}`);
  }
  return body.data as T;
}

export async function fetchBoardItems(
  boardId: number,
  columnIds: string[]
): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;
  const colIdsStr = columnIds.map((c) => `"${c}"`).join(",");

  while (true) {
    const query: string = cursor
      ? `{ next_items_page(cursor: "${cursor}", limit: 500) {
           cursor
           items { id name column_values(ids: [${colIdsStr}]) { id text value } }
         } }`
      : `{ boards(ids: [${boardId}]) {
           items_page(limit: 500) {
             cursor
             items { id name column_values(ids: [${colIdsStr}]) { id text value } }
           }
         } }`;

    const data = await mondayGraphQL<any>(query);
    const page: { cursor: string | null; items: MondayItem[] } = cursor
      ? data.next_items_page
      : data.boards[0].items_page;
    items.push(...page.items);
    cursor = page.cursor;
    if (!cursor) break;
  }

  return items;
}

export async function createItem(
  boardId: number,
  itemName: string,
  columnValues: Record<string, unknown>,
  groupId?: string
): Promise<string> {
  const escapedName = itemName.replace(/"/g, '\\"');
  const escapedValues = JSON.stringify(JSON.stringify(columnValues));
  const groupArg = groupId ? `group_id: "${groupId}",` : "";
  const query = `mutation {
    create_item(
      board_id: ${boardId},
      ${groupArg}
      item_name: "${escapedName}",
      column_values: ${escapedValues}
    ) { id }
  }`;
  const data = await mondayGraphQL<{ create_item: { id: string } }>(query);
  return data.create_item.id;
}

export async function deleteItem(itemId: string): Promise<void> {
  const query = `mutation { delete_item(item_id: ${itemId}) { id } }`;
  await mondayGraphQL<{ delete_item: { id: string } }>(query);
}

// Edits an existing item's columns. A "name" key inside columnValues
// renames the item itself — that's Monday's own convention for
// change_multiple_column_values, not a column we invented.
export async function updateItem(
  boardId: number,
  itemId: string,
  columnValues: Record<string, unknown>
): Promise<void> {
  const escapedValues = JSON.stringify(JSON.stringify(columnValues));
  const query = `mutation {
    change_multiple_column_values(
      board_id: ${boardId},
      item_id: ${itemId},
      column_values: ${escapedValues}
    ) { id }
  }`;
  await mondayGraphQL<{ change_multiple_column_values: { id: string } }>(query);
}

export async function fetchItemDetail(
  itemId: string,
  columnIds: string[]
): Promise<MondayItem> {
  const colIdsStr = columnIds.map((c) => `"${c}"`).join(",");
  const query = `{ items(ids: [${itemId}]) {
    id name column_values(ids: [${colIdsStr}]) { id text value }
  } }`;
  const data = await mondayGraphQL<{ items: MondayItem[] }>(query);
  return data.items[0];
}

export type { MondayItem, MondayColumnValue };
