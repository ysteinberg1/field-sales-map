// Small source-board badges for pins that aren't SalesRabbit leads (those
// get their own per-status icon set in statusIcons.ts). Same
// data-URI-SVG approach: one source feeds both maplibre images and any
// future UI use.
//
// - Pipedrive Archive board, not yet Won -> "pipedrive" badge
// - Deals / Old Cashflow board, not yet Won -> "monday" badge
// - Deals or Pipedrive Archive board, Stage/Status label is exactly "Won"
//   (confirmed against the live columns: deal_stage on Deals, status on
//   Pipedrive Archive both carry a "Won" label) -> "won" badge, same green
//   Monday itself uses for that label (#00c875)
export type SourceBadgeKind = "pipedrive" | "monday" | "won";

const WON_COLOR = "#00c875";

const BADGES: Record<SourceBadgeKind, { bg: string; glyph: string }> = {
  // Pipedrive's own mark is a dark badge with a bold lowercase "p" —
  // approximated flat, not a pixel copy of their logo file.
  pipedrive: {
    bg: "#26292c",
    glyph: `<path d="M9.5 8.2c1-.9 2.2-1.4 3.6-1.4 3 0 5.2 2.4 5.2 5.5s-2.2 5.5-5.2 5.5c-1.4 0-2.6-.5-3.6-1.4V19a1.3 1.3 0 0 1-2.6 0V8.4a1.3 1.3 0 0 1 2.6 0z" fill="none" stroke="white" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12.6" cy="12.3" r="2.9" fill="white"/>`,
  },
  // Monday.com's own mark is four fanned color petals — approximated as
  // four rounded bars in Monday's own brand colors, not a pixel copy.
  monday: {
    bg: "#ffffff",
    glyph: `<g stroke-linecap="round" stroke-width="4"><line x1="5" y1="7" x2="7.5" y2="7" stroke="#ff3d57"/><line x1="5" y1="12" x2="9.5" y2="12" stroke="#ffcb00"/><line x1="5" y1="17" x2="12" y2="17" stroke="#00ca72"/><line x1="15" y1="12" x2="19" y2="7" stroke="#579bfc"/></g>`,
  },
  won: {
    bg: WON_COLOR,
    glyph: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
};

export function sourceBadgeSvg(kind: SourceBadgeKind, size = 32): string {
  const { bg, glyph } = BADGES[kind];
  const border = kind === "monday" ? `<rect x="1" y="1" width="22" height="22" rx="6" fill="none" stroke="#e0e0e0" stroke-width="1.5"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="${bg}"/>${glyph}${border}</svg>`;
}

export function sourceBadgeDataUri(kind: SourceBadgeKind, size = 32): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(sourceBadgeSvg(kind, size))}`;
}

export function loadSourceBadgeImage(kind: SourceBadgeKind, size = 48): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceBadgeDataUri(kind, size);
  });
}
