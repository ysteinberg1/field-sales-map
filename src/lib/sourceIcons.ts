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
// SVG glyph like the rest of the icon set. All three render as a circle
// with a drop shadow so they read as pins sitting on the map, not flat
// square stickers.
export type SourceBadgeKind = "pipedrive" | "monday" | "won";

const LOGO_FILES: Record<"pipedrive" | "monday", string> = {
  pipedrive: "/pipedrive-logo.png",
  monday: "/monday-logo.png",
};

// Same drop-shadow filter used by statusIcons.ts, kept identical so every
// pin on the map "pops" the same amount. Needs real margin around the
// badge shape to render into — see the note in statusIcons.ts.
const SHADOW_FILTER = `<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.6" flood-color="#000" flood-opacity="0.5"/></filter>`;

// Content is drawn in a 48x48 local box; translating by (8,8) into a
// 64x64 canvas leaves 8 units of margin on every side for the shadow.
function wonSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs>${SHADOW_FILTER}</defs>
    <g transform="translate(8,8)" filter="url(#shadow)">
      <circle cx="24" cy="24" r="21" fill="#00c875"/>
      <path d="M13 25l7 7L36 17" fill="none" stroke="white" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

function logoSvg(kind: "pipedrive" | "monday", size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs>
      ${SHADOW_FILTER}
      <clipPath id="circle"><circle cx="24" cy="24" r="21"/></clipPath>
    </defs>
    <g transform="translate(8,8)" filter="url(#shadow)">
      <circle cx="24" cy="24" r="21" fill="white"/>
      <!-- "meet" (contain), not "slice" (cover) — never crop the logo, even
           if that leaves a sliver of the white circle showing around it. -->
      <image href="${LOGO_FILES[kind]}" x="5" y="5" width="38" height="38" preserveAspectRatio="xMidYMid meet" clip-path="url(#circle)"/>
    </g>
  </svg>`;
}

export function sourceBadgeSvg(kind: SourceBadgeKind, size = 64): string {
  return kind === "won" ? wonSvg(size) : logoSvg(kind, size);
}

export function sourceBadgeDataUri(kind: SourceBadgeKind, size = 64): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(sourceBadgeSvg(kind, size))}`;
}

export function loadSourceBadgeImage(kind: SourceBadgeKind, size = 64): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceBadgeDataUri(kind, size);
  });
}
