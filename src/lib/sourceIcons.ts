// Source-board badges for pins that aren't SalesRabbit leads (those get
// their own per-status icon set in statusIcons.ts).
//
// - Pipedrive Archive board, not yet Won -> real Pipedrive mark
// - Deals / Old Cashflow board, not yet Won -> real Monday.com mark
// - Deals or Pipedrive Archive board, Stage/Status label is exactly "Won"
//   (confirmed against the live columns: deal_stage on Deals, status on
//   Pipedrive Archive both carry a "Won" label) -> green check, the same
//   green Monday itself uses for that label (#00c875)
//
// Pipedrive/Monday marks are their real logo files (pulled from their own
// sites' favicons) — fine for an internal tool, not something we're
// shipping commercially. "Won" isn't a brand mark, so it stays a drawn
// SVG glyph like the rest of the icon set.
export type SourceBadgeKind = "pipedrive" | "monday" | "won";

const LOGO_FILES: Record<"pipedrive" | "monday", string> = {
  pipedrive: "/pipedrive-logo.png",
  monday: "/monday-logo.png",
};

const WON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#00c875"/><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function sourceBadgeDataUri(kind: SourceBadgeKind): string {
  if (kind === "won") return `data:image/svg+xml;utf8,${encodeURIComponent(WON_SVG)}`;
  return LOGO_FILES[kind];
}

export function loadSourceBadgeImage(kind: SourceBadgeKind, size = 48): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceBadgeDataUri(kind);
  });
}
