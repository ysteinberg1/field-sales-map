// Small flat-icon badge set for SalesRabbit lead statuses — a colored
// rounded square with a simple white glyph, matching SalesRabbit's own
// "Lead Status Settings" icon style. One source of truth (SVG markup)
// feeds both the status dropdown (as an <img> data URI) and the map
// (as a maplibre image loaded from the same data URI).

type IconKey =
  | "sun"
  | "question"
  | "pin"
  | "phone"
  | "bug"
  | "undo"
  | "badge"
  | "document"
  | "check"
  | "x"
  | "flag"
  | "shield"
  | "ring"
  | "lock";

interface StatusIconMeta {
  color: string;
  icon: IconKey;
}

// Exact keys must match STATUS_OPTIONS in FieldMap.tsx (the live labels
// off the SalesRabbit board's Status column).
export const STATUS_ICON_META: Record<string, StatusIconMeta> = {
  "Area To Canvas": { color: "#b5651d", icon: "sun" },
  "Big Brand Corporate": { color: "#9e9e9e", icon: "shield" },
  CRM: { color: "#4fc3f7", icon: "lock" },
  Callback: { color: "#ffca28", icon: "phone" },
  Complete: { color: "#3949ab", icon: "check" },
  Customer: { color: "#43a047", icon: "badge" },
  "Go Back !": { color: "#e53935", icon: "undo" },
  "Go Back - Low": { color: "#fbc02d", icon: "undo" },
  "Major Renovation Coming": { color: "#d81b60", icon: "flag" },
  "Met - Needs Push": { color: "#5c6bc0", icon: "bug" },
  "Not Interested": { color: "#9e9e9e", icon: "x" },
  "Not Qualified - DEAD": { color: "#424242", icon: "x" },
  Other: { color: "#8e24aa", icon: "ring" },
  Processing: { color: "#4dd0c4", icon: "document" },
  "To Visit": { color: "#7cb342", icon: "pin" },
  "What's Here": { color: "#f0a500", icon: "question" },
};

const DEFAULT_ICON_META: StatusIconMeta = { color: "#616161", icon: "ring" };

// Hand-drawn 24x24 glyphs, white fill/stroke, kept deliberately simple.
// "pin" carries a PUNCH_COLOR placeholder for its hole, filled with the
// badge's own background color so it reads as a punched-out circle.
const GLYPHS: Record<IconKey, string> = {
  sun: `<circle cx="12" cy="12" r="3.5" fill="white"/><g stroke="white" stroke-width="2" stroke-linecap="round"><line x1="12" y1="3" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="21"/><line x1="3" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="21" y2="12"/><line x1="5.6" y1="5.6" x2="7.4" y2="7.4"/><line x1="16.6" y1="16.6" x2="18.4" y2="18.4"/><line x1="5.6" y1="18.4" x2="7.4" y2="16.6"/><line x1="16.6" y1="7.4" x2="18.4" y2="5.6"/></g>`,
  question: `<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.1-1.5 2.4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.5" r="1.1" fill="white"/>`,
  pin: `<path d="M12 21s-6.5-6.8-6.5-11.2a6.5 6.5 0 1 1 13 0C18.5 14.2 12 21 12 21z" fill="white"/><circle cx="12" cy="9.6" r="2.3" fill="PUNCH_COLOR"/>`,
  phone: `<path d="M7.5 4.5c.5 0 .9.3 1 .8l.6 2.4c.1.4 0 .8-.3 1.1L7.6 10c1 2 2.7 3.7 4.7 4.7l1.2-1.2c.3-.3.7-.4 1.1-.3l2.4.6c.5.1.8.5.8 1v2c0 .6-.5 1-1 1C10.9 17.8 6.2 13.1 6.2 7.5c0-.5.4-1 .9-1z" fill="white"/>`,
  bug: `<ellipse cx="12" cy="13.5" rx="3.6" ry="5" fill="white"/><circle cx="12" cy="7" r="2" fill="white"/><g stroke="white" stroke-width="1.4" stroke-linecap="round"><line x1="8.6" y1="11" x2="5.5" y2="9.5"/><line x1="8.6" y1="14" x2="5.2" y2="14"/><line x1="8.6" y1="17" x2="5.5" y2="18.5"/><line x1="15.4" y1="11" x2="18.5" y2="9.5"/><line x1="15.4" y1="14" x2="18.8" y2="14"/><line x1="15.4" y1="17" x2="18.5" y2="18.5"/></g>`,
  undo: `<path d="M6 9H4V6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 9.5A7 7 0 1 1 6 15" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
  badge: `<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="white" stroke-width="2"/><circle cx="9" cy="12" r="1.8" fill="white"/><g stroke="white" stroke-width="1.4" stroke-linecap="round"><line x1="13.5" y1="10.3" x2="17.5" y2="10.3"/><line x1="13.5" y1="13.7" x2="17.5" y2="13.7"/></g>`,
  document: `<path d="M8 3.5h6l4 4V19a1.2 1.2 0 0 1-1.2 1.2H8A1.2 1.2 0 0 1 6.8 19V4.7A1.2 1.2 0 0 1 8 3.5z" fill="none" stroke="white" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3.5V7.5h4" fill="none" stroke="white" stroke-width="1.8" stroke-linejoin="round"/><line x1="9.5" y1="12" x2="14.5" y2="12" stroke="white" stroke-width="1.4" stroke-linecap="round"/><line x1="9.5" y1="15" x2="14.5" y2="15" stroke="white" stroke-width="1.4" stroke-linecap="round"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  x: `<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round"/>`,
  flag: `<line x1="6" y1="3.5" x2="6" y2="20.5" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M6 4.5h11l-2.8 3.6L17 11.8H6z" fill="white"/>`,
  shield: `<path d="M12 3.5l6.5 2.4v5.3c0 4-2.7 6.9-6.5 8.3-3.8-1.4-6.5-4.3-6.5-8.3V5.9L12 3.5z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/>`,
  ring: `<circle cx="12" cy="12" r="6" fill="none" stroke="white" stroke-width="2.4"/>`,
  lock: `<rect x="5.5" y="11" width="13" height="9" rx="2" fill="white"/><path d="M8.2 11V7.6a3.8 3.8 0 0 1 7.6 0V11" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`,
};

export function statusIconSvg(status: string, size = 32): string {
  const meta = STATUS_ICON_META[status] ?? DEFAULT_ICON_META;
  const glyph = GLYPHS[meta.icon].replaceAll("PUNCH_COLOR", meta.color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="${meta.color}"/>${glyph}</svg>`;
}

export function statusIconDataUri(status: string, size = 32): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(statusIconSvg(status, size))}`;
}

// For maplibre's map.addImage — decodes the same SVG into a bitmap.
export function loadStatusIconImage(status: string, size = 48): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = statusIconDataUri(status, size);
  });
}
