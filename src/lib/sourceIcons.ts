// Source-board badges for pins that aren't SalesRabbit leads — pre-baked
// PNGs (public/badges/), not generated in the browser. See the comment
// in statusIcons.ts for why: composing these live (SVG with an embedded
// external <image> for the Pipedrive/Monday logos, plus a drop-shadow
// filter) was producing blank white circles on the map — a relative
// href inside a data:image/svg+xml URI and SVG filter effects both have
// unreliable load-completion signals, so maplibre would sometimes
// capture the bitmap before the logo or the shadow had actually
// rendered. Baking these once offline (sharp: real raster compositing,
// real Gaussian blur, real circle clip) sidesteps that entirely.
//
// - Pipedrive Archive board, not yet Won -> real Pipedrive mark
// - Deals / Old Cashflow board, not yet Won -> real Monday.com mark
// - Deals or Pipedrive Archive board, Stage/Status label is exactly "Won"
//   (confirmed against the live columns: deal_stage on Deals, status on
//   Pipedrive Archive both carry a "Won" label) -> green check, the same
//   green Monday itself uses for that label (#00c875)
export type SourceBadgeKind = "pipedrive" | "monday" | "won";

export function sourceBadgeUrl(kind: SourceBadgeKind): string {
  return `/badges/source-${kind}.png`;
}

export function sourceBadgeDataUri(kind: SourceBadgeKind): string {
  return sourceBadgeUrl(kind);
}

export function loadSourceBadgeImage(kind: SourceBadgeKind): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sourceBadgeUrl(kind);
  });
}
