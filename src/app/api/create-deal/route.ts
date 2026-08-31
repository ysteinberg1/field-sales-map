import { NextResponse } from "next/server";
import { BOARDS, createItem } from "@/lib/monday";

// Landing board for new pins created from the field. Change to "deals" here
// if the "create in SalesRabbit, promote later" decision changes.
const TARGET_BOARD: keyof typeof BOARDS = "salesrabbit";

// SalesRabbit column IDs, confirmed against the live board.
const SALESRABBIT_LOCATION_COL = "location_mm6kf638"; // Dedup Location — the column the map actually reads
const SALESRABBIT_SALESMAN_COL = "color_mm4v4hed"; // Lead Owner (status). Labels: JJ, Yoel, Shragie, Chuny, Ari, Neil
const SALESRABBIT_NOTE_COL = "long_text_mm4v6hdv"; // Note
const SALESRABBIT_STATUS_COL = "color_mm4vht3r"; // Status — see STATUS_OPTIONS in FieldMap.tsx for exact labels

// New leads from the app land in their own group, separate from the
// historical SalesRabbit import sitting in "Sales Rabbit".
const SALESRABBIT_NEW_LEAD_GROUP = "group_mm6rvsa1"; // "Sales Map" group

export async function POST(request: Request) {
  const { name, lat, lng, address, salesman, note, status } = await request.json();

  if (!name || lat == null || lng == null) {
    return NextResponse.json({ error: "name, lat, lng required" }, { status: 400 });
  }

  const board = BOARDS[TARGET_BOARD];

  const columnValues: Record<string, unknown> = {
    [SALESRABBIT_LOCATION_COL]: { lat: String(lat), lng: String(lng), address: address ?? "" },
  };
  if (salesman) {
    // Status columns take { label: "<exact label text>" }, not a bare string.
    columnValues[SALESRABBIT_SALESMAN_COL] = { label: salesman };
  }
  if (note) {
    columnValues[SALESRABBIT_NOTE_COL] = { text: note };
  }
  if (status) {
    columnValues[SALESRABBIT_STATUS_COL] = { label: status };
  }

  const itemId = await createItem(board.id, name, columnValues, SALESRABBIT_NEW_LEAD_GROUP);

  return NextResponse.json({ ok: true, itemId });
}
