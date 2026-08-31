// Status-icon badges for SalesRabbit leads — pre-baked PNGs (public/badges/),
// not generated in the browser.
//
// The previous version composed these as inline SVG (colored circle + white
// glyph + feDropShadow) via a data:image/svg+xml URI. That worked for the
// dropdown but produced blank/inconsistent icons on the map: the drop
// shadow needs the SVG filter to actually finish rendering before the
// bitmap is captured, and there's no reliable "wait for this" signal for
// an <img>'s load event on SVG filter effects — so maplibre would
// sometimes grab a frame before the shadow (or even the shape) was
// painted. Baking these once, offline, with real image compositing
// (sharp) removes that whole class of bug: what ships is a normal PNG
// file, loaded the normal way.

// Exact keys must match STATUS_OPTIONS in FieldMap.tsx (the live labels
// off the SalesRabbit board's Status column).
const STATUS_SLUGS: Record<string, string> = {
  "Area To Canvas": "area-to-canvas",
  "Big Brand Corporate": "big-brand-corporate",
  CRM: "crm",
  Callback: "callback",
  Complete: "complete",
  Customer: "customer",
  "Go Back !": "go-back",
  "Go Back - Low": "go-back-low",
  "Major Renovation Coming": "major-renovation-coming",
  "Met - Needs Push": "met-needs-push",
  "Not Interested": "not-interested",
  "Not Qualified - DEAD": "not-qualified-dead",
  Other: "other",
  Processing: "processing",
  "To Visit": "to-visit",
  "What's Here": "what-s-here",
};

const DEFAULT_SLUG = "default";

export function statusIconUrl(status: string): string {
  const slug = STATUS_SLUGS[status] ?? DEFAULT_SLUG;
  return `/badges/status-${slug}.png`;
}

// Kept as statusIconDataUri for compatibility with existing callers — it's
// a plain file URL now, not a data: URI, but works identically as an
// <img src>.
export function statusIconDataUri(status: string): string {
  return statusIconUrl(status);
}

export function loadStatusIconImage(status: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = statusIconUrl(status);
  });
}
