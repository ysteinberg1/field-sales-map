"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Renderer as ClusterRenderer } from "@googlemaps/markerclusterer";
import { statusIconDataUri } from "@/lib/statusIcons";
import { sourceBadgeDataUri } from "@/lib/sourceIcons";

type SalesmanBucket = "Chuny" | "Ari" | "Shragie" | "Other";

interface Pin {
  board: string;
  tier: number;
  itemId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  status: string | null;
  stage: string | null;
  salesman: SalesmanBucket;
}

// Monday board IDs, for building "Open in Monday" links from the popup.
const MONDAY_WORKSPACE_URL = "https://providentled-company.monday.com";
const BOARD_IDS: Record<string, number> = {
  deals: 1558281108,
  old_cashflow: 5102612766,
  pipedrive: 5102614839,
  salesrabbit: 5099562913,
};

// Display names for the popup's "source" line and the board-filter toggle.
const BOARD_LABELS: Record<string, string> = {
  deals: "Monday Deals",
  old_cashflow: "Old Cashflow",
  pipedrive: "Pipedrive",
  salesrabbit: "SalesRabbit",
};
const ALL_BOARDS = ["deals", "old_cashflow", "pipedrive", "salesrabbit"];

// Per-board popup styling + which columns get special treatment (header
// date, Won Date pill, salesman/owner) instead of showing up in the
// generic field list — mirrors BOARD_META in src/lib/monday.ts.
const BOARD_META: Record<
  string,
  {
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
    color: "#4c7a2e",
    bg: "#e9f1e1",
    text: "#294617",
    headerDateCol: "date_mkv0gff1",
    wonDateCol: "date_mkv0sgxs",
    stageCol: "deal_stage",
    salesmanCol: "color_mkv0qrwq",
  },
  old_cashflow: {
    color: "#b23b34",
    bg: "#f7e6e4",
    text: "#6b201b",
    headerDateCol: null,
    wonDateCol: null,
    stageCol: null,
    salesmanCol: "color_mm6d1vdk",
  },
  pipedrive: {
    color: "#57544d",
    bg: "#eae8e2",
    text: "#302e29",
    headerDateCol: "date4",
    wonDateCol: "date_mm6d9hje",
    stageCol: "status",
    salesmanCol: "color_mm6dw3r2",
  },
  salesrabbit: {
    color: "#2f6fa8",
    bg: "#e5eef6",
    text: "#1a3c56",
    headerDateCol: "date_mm6mgd2r",
    wonDateCol: null,
    stageCol: null,
    salesmanCol: "color_mm4v4hed",
  },
};

const SALESMEN = ["Yoel", "Ari", "Chuny", "Shragie", "Neil", "JJ"];
const SALESMAN_FILTERS: SalesmanBucket[] = ["Chuny", "Ari", "Shragie", "Other"];

// Utility-territory overlay, exported from the SalesRabbit Google Earth
// project (Provident_LED_-_Map_fixed.kmz) — a GroundOverlay PNG with a
// fixed lat/lng bounding box. Off by default, same as the KMZ's own folder.
const TERRITORY_IMAGE_URL = "/utility-territory.png";
const TERRITORY_BOUNDS = { north: 41.40564881847246, south: 38.880312151348846, east: -73.86066137494016, west: -75.59305370948213 };

// Exact labels from the SalesRabbit board's Status column (color_mm4vht3r) —
// order matches Monday's own index order. Per-status icon/color is defined
// in src/lib/statusIcons.ts, keyed off these exact strings.
const STATUS_OPTIONS = [
  "Area To Canvas",
  "Big Brand Corporate",
  "CRM",
  "Callback",
  "Complete",
  "Customer",
  "Go Back !",
  "Go Back - Low",
  "Major Renovation Coming",
  "Met - Needs Push",
  "Not Interested",
  "Not Qualified - DEAD",
  "Other",
  "Processing",
  "To Visit",
  "What's Here",
];

// Raw Monday column ID -> human label, for the tap-to-view popup.
const FIELD_LABELS: Record<string, string> = {
  color_mm4v4hed: "Lead Owner",
  color_mm4vht3r: "Status",
  long_text_mm4v6hdv: "Note",
  date_mm6mgd2r: "Created",
  status: "Stage",
  color_mm6dw3r2: "Salesman",
  date4: "Deal Created",
  text_mm6dbpxy: "Address",
  color_mm6d1vdk: "Salesman",
  date_mm6drq5j: "Installed",
  color_mkv0qrwq: "Salesman",
  deal_stage: "Stage",
  long_text_mm6khzqt: "Sales Notes",
};

// A soft white/gray/green look (Esri's Light Gray Canvas, matched here) —
// only applies to ROADMAP; Google ignores `styles` for SATELLITE/HYBRID,
// which is expected (there's no "restyle the satellite imagery" option).
const ROADMAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f5f0e8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f0ead6" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eaf1e9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d8ecd4" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe3ea" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
];

// Nearby-business search: fires this long after the map view stops
// changing (Yoel's own spec — "3 to 5 seconds"), and only within a fresh
// area (cached by rounded center+zoom so revisiting a spot doesn't re-query).
const NEARBY_DEBOUNCE_MS = 4000;
const nearbyCache = new Map<string, { name: string; lat: number; lng: number; address: string | null }[]>();

function iconUrlForPin(p: Pin): string {
  if (p.board === "salesrabbit") return statusIconDataUri(p.status ?? "__unmatched__");
  // Old Cashflow only ever holds historical, already-closed customers — it
  // doesn't even track a stage/status, so it's always effectively "Won".
  // Each board gets its own "won" color so the source is visible at a
  // glance: green = Deals, red = Old Cashflow, dark gray = Pipedrive.
  if (p.board === "old_cashflow") return sourceBadgeDataUri("won-oldcashflow");
  if (p.board === "pipedrive") return p.stage === "Won" ? sourceBadgeDataUri("won-pipedrive") : sourceBadgeDataUri("pipedrive");
  if (p.stage === "Won") return sourceBadgeDataUri("won");
  return sourceBadgeDataUri("monday");
}

// Same bucketing rule as normalizeSalesman in src/lib/pins.ts, duplicated
// here since this is a client component — used only for the pin dropped
// instantly on the map right after creating a lead (see submitDeal).
function normalizeSalesmanClient(raw: string | null | undefined): SalesmanBucket {
  switch (raw) {
    case "Chuny":
    case "Chuny Koenig":
      return "Chuny";
    case "Ari":
    case "Ari Weber":
      return "Ari";
    case "Shragie":
    case "Shragie Gobioff":
      return "Shragie";
    default:
      return "Other";
  }
}

function nearbyCacheKey(center: google.maps.LatLng, zoom: number): string {
  return `${center.lat().toFixed(2)},${center.lng().toFixed(2)}@${Math.round(zoom)}`;
}

export default function FieldMap({ googleMapsApiKey }: { googleMapsApiKey: string }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const pendingMarkerRef = useRef<google.maps.Marker | null>(null);
  const pinsRef = useRef<Pin[]>([]);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const territoryOverlayRef = useRef<google.maps.GroundOverlay | null>(null);
  const nearbyMarkersRef = useRef<google.maps.Marker[]>([]);
  const nearbyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNearbyRef = useRef(false);
  const runNearbySearchRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleBoardsRef = useRef<Set<string>>(new Set(ALL_BOARDS));
  const visibleSalesmenRef = useRef<Set<SalesmanBucket>>(new Set(SALESMAN_FILTERS));
  const renderPinsRef = useRef<((pins: Pin[]) => void) | null>(null);
  const deleteLeadRef = useRef<((pin: Pin, marker: google.maps.Marker) => void) | null>(null);

  const [salesman, setSalesman] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{
    lat: number;
    lng: number;
    address: string | null;
    loadingAddress: boolean;
  } | null>(null);
  const [dealName, setDealName] = useState("");
  const [dealNote, setDealNote] = useState("");
  const [dealStatus, setDealStatus] = useState(STATUS_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [mapType, setMapType] = useState<"roadmap" | "satellite" | "hybrid">("hybrid");
  const [showTerritory, setShowTerritory] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [visibleBoards, setVisibleBoards] = useState<Set<string>>(new Set(ALL_BOARDS));
  const [boardFilterOpen, setBoardFilterOpen] = useState(false);
  const [visibleSalesmen, setVisibleSalesmen] = useState<Set<SalesmanBucket>>(new Set(SALESMAN_FILTERS));
  const [salesmanFilterOpen, setSalesmanFilterOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("fsm_salesman");
    if (saved) setSalesman(saved);
  }, []);

  useEffect(() => {
    showNearbyRef.current = showNearby;
    if (!showNearby) {
      nearbyMarkersRef.current.forEach((m) => m.setMap(null));
      nearbyMarkersRef.current = [];
      if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
    } else {
      // Search right away — an "idle" event only fires on the *next*
      // pan/zoom, so without this, switching the toggle on while the map
      // is already sitting still would never search at all.
      runNearbySearchRef.current?.();
    }
  }, [showNearby]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !salesman) return;
    if (!googleMapsApiKey) {
      console.error("[field-map] GOOGLE_MAPS_API_KEY is not set");
      return;
    }

    let cancelled = false;

    (async () => {
      setOptions({ key: googleMapsApiKey, v: "weekly" });
      const [{ Map: GMap, InfoWindow, GroundOverlay }, { Marker }, , , { LatLngBounds }] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("places"),
        importLibrary("geometry"),
        importLibrary("core"),
      ]);
      if (cancelled || !mapContainer.current) return;

      const map = new GMap(mapContainer.current, {
        center: { lat: 40.85, lng: -74.15 }, // NJ/NY fallback
        zoom: 10,
        mapTypeId: "hybrid",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: ROADMAP_STYLE,
      });
      mapRef.current = map;
      const infoWindow = new InfoWindow();
      infoWindowRef.current = infoWindow;

      // Search bar (Places Autocomplete).
      if (searchInputRef.current) {
        const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
          fields: ["geometry"],
        });
        autocomplete.bindTo("bounds", map);
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (place.geometry?.location) {
            map.panTo(place.geometry.location);
            map.setZoom(15);
          }
        });
      }

      // Center on the salesman's live location if they allow it.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            map.setZoom(14);
          },
          () => {
            /* denied or unavailable — keep the NJ/NY fallback view */
          }
        );
      }

      // Utility-territory overlay.
      const territoryOverlay = new GroundOverlay(TERRITORY_IMAGE_URL, new LatLngBounds(
        { lat: TERRITORY_BOUNDS.south, lng: TERRITORY_BOUNDS.west },
        { lat: TERRITORY_BOUNDS.north, lng: TERRITORY_BOUNDS.east }
      ), { opacity: 0.45 });
      territoryOverlayRef.current = territoryOverlay;

      // Slightly bigger pin icons on desktop — a phone screen stays tight so
      // more pins fit without crowding, but a desktop has room to spare.
      const ICON_PX = window.innerWidth >= 1024 ? 40 : 30;

      // Bigger icon on the currently-open pin — reset when the popup closes.
      let activeMarker: google.maps.Marker | null = null;
      let activeMarkerIcon: google.maps.Icon | null = null;
      const clearActiveMarkerHighlight = () => {
        if (activeMarker && activeMarkerIcon) activeMarker.setIcon(activeMarkerIcon);
        activeMarker = null;
        activeMarkerIcon = null;
      };
      infoWindow.addListener("closeclick", clearActiveMarkerHighlight);

      const formatDate = (iso: string | null | undefined) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      };

      const showPinInfo = (pin: Pin, marker: google.maps.Marker) => {
        // Center the map on the pin and enlarge its icon slightly while
        // the popup is open, so the tapped pin is unmistakable.
        clearActiveMarkerHighlight();
        map.panTo(marker.getPosition()!);
        const currentIcon = marker.getIcon() as google.maps.Icon;
        activeMarker = marker;
        activeMarkerIcon = currentIcon;
        const baseSize = currentIcon.scaledSize?.width ?? ICON_PX;
        marker.setIcon({ ...currentIcon, scaledSize: new google.maps.Size(baseSize * 1.25, baseSize * 1.25) });
        marker.setZIndex(9999);

        const meta = BOARD_META[pin.board];
        const boardLabel = BOARD_LABELS[pin.board] ?? pin.board;
        const iconUrl = iconUrlForPin(pin);

        infoWindow.setContent(
          `<div style="min-width:230px;border-left:4px solid ${meta.color};padding-left:10px">
             <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
               <div style="display:flex;align-items:center;gap:8px;min-width:0">
                 <img src="${iconUrl}" width="30" height="30" style="flex-shrink:0" />
                 <div style="min-width:0">
                   <div style="font-weight:600;color:#171717;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pin.name}</div>
                 </div>
               </div>
               <button id="fm-popup-close" aria-label="Close" style="flex-shrink:0;width:22px;height:22px;border-radius:6px;border:1px solid #e5e5e5;background:white;color:#737373;cursor:pointer;font-size:14px;line-height:1">×</button>
             </div>
             <div style="display:inline-block;margin-top:6px;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;background:${meta.bg};color:${meta.text}">${boardLabel}</div>
             <div style="margin-top:8px;font-size:13px;font-style:italic;color:#a3a3a3">Loading details…</div>
           </div>`
        );
        infoWindow.open({ map, anchor: marker });
        google.maps.event.addListenerOnce(infoWindow, "domready", () => {
          document.getElementById("fm-popup-close")?.addEventListener("click", () => infoWindow.close());
        });

        fetch(`/api/item/${pin.itemId}?board=${pin.board}`)
          .then((r) => r.json())
          .then((full) => {
            const details: Record<string, string | null> = full.details ?? {};
            const excluded = new Set(
              [meta.headerDateCol, meta.wonDateCol, meta.stageCol, meta.salesmanCol].filter(
                (c): c is string => c !== null
              )
            );

            const headerDate = meta.headerDateCol ? formatDate(details[meta.headerDateCol]) : null;
            const ownerName = details[meta.salesmanCol] || null;
            const boardId = BOARD_IDS[pin.board];
            const mondayUrl = `${MONDAY_WORKSPACE_URL}/boards/${boardId}/pulses/${pin.itemId}`;

            let stageRow = "";
            if (meta.stageCol) {
              const stageVal = details[meta.stageCol];
              if (stageVal) {
                const wonDate = meta.wonDateCol ? formatDate(details[meta.wonDateCol]) : null;
                const wonPill =
                  stageVal === "Won" && wonDate
                    ? ` <span style="display:inline-block;margin-left:4px;font-size:10.5px;font-weight:500;padding:1px 7px;border-radius:20px;background:${meta.bg};color:${meta.text}">Won ${wonDate}</span>`
                    : "";
                stageRow = `<div><span style="color:#a3a3a3">${FIELD_LABELS[meta.stageCol] ?? "Stage"}:</span> ${stageVal}${wonPill}</div>`;
              }
            }

            const otherRows = Object.entries(details)
              .filter(([k, v]) => v && !excluded.has(k))
              .map(([k, v]) => `<div><span style="color:#a3a3a3">${FIELD_LABELS[k] ?? k}:</span> ${v}</div>`)
              .join("");

            const deleteBtn =
              pin.board === "salesrabbit"
                ? `<button id="fm-popup-delete" style="font-size:12px;color:#b23b34;background:none;border:none;padding:0;cursor:pointer">Delete lead</button>`
                : `<span style="font-size:12px;color:#a3a3a3;font-style:italic">Synced from Monday</span>`;

            infoWindow.setContent(
              `<div style="min-width:230px;border-left:4px solid ${meta.color};padding-left:10px">
                 <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                   <div style="display:flex;align-items:center;gap:8px;min-width:0">
                     <img src="${iconUrl}" width="30" height="30" style="flex-shrink:0" />
                     <div style="min-width:0">
                       <div style="font-weight:600;color:#171717;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${full.name}</div>
                       ${headerDate ? `<div style="font-size:11.5px;color:#737373">Created ${headerDate}</div>` : ""}
                     </div>
                   </div>
                   <div style="display:flex;gap:6px;flex-shrink:0">
                     <a href="${mondayUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open in Monday" style="width:22px;height:22px;border-radius:6px;border:1px solid #e5e5e5;background:white;color:#737373;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:12px">↗</a>
                     <button id="fm-popup-close" aria-label="Close" style="width:22px;height:22px;border-radius:6px;border:1px solid #e5e5e5;background:white;color:#737373;cursor:pointer;font-size:14px;line-height:1">×</button>
                   </div>
                 </div>
                 <div style="display:inline-block;margin-top:6px;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;background:${meta.bg};color:${meta.text}">${boardLabel}</div>
                 <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;font-size:13px;color:#404040;line-height:1.6">
                   ${stageRow}${otherRows}
                 </div>
                 <div style="margin-top:10px;padding-top:8px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;font-size:12px">
                   <div style="color:#a3a3a3">Owned by <b style="color:#404040;font-weight:500">${ownerName ?? "—"}</b></div>
                   ${deleteBtn}
                 </div>
               </div>`
            );
            google.maps.event.addListenerOnce(infoWindow, "domready", () => {
              document.getElementById("fm-popup-close")?.addEventListener("click", () => infoWindow.close());
              document.getElementById("fm-popup-delete")?.addEventListener("click", () => {
                if (!window.confirm(`Delete "${full.name}"? This removes it from Monday and the map.`)) return;
                deleteLeadRef.current?.(pin, marker);
                infoWindow.close();
              });
            });
          });
      };

      // Only ever called for SalesRabbit pins — the popup only renders a
      // Delete lead button for that board (see the deleteBtn ternary
      // above). Deletes the Monday item and drops the pin from the map.
      deleteLeadRef.current = (pin, marker) => {
        fetch("/api/delete-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: pin.itemId, board: pin.board }),
        })
          .then((r) => r.json())
          .then((result) => {
            if (!result.ok) {
              window.alert("Couldn't delete this lead. Try again.");
              return;
            }
            clustererRef.current?.removeMarker(marker);
            marker.setMap(null);
            markersRef.current.delete(`${pin.board}:${pin.itemId}`);
            pinsRef.current = pinsRef.current.filter(
              (p) => !(p.board === pin.board && p.itemId === pin.itemId)
            );
          })
          .catch(() => window.alert("Couldn't delete this lead. Try again."));
      };

      const renderPins = (pins: Pin[]) => {
        clustererRef.current?.clearMarkers();
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = new Map();

        const visible = pins.filter(
          (pin) => visibleBoardsRef.current.has(pin.board) && visibleSalesmenRef.current.has(pin.salesman)
        );
        const markers = visible.map((pin) => {
          const marker = new Marker({
            position: { lat: pin.lat, lng: pin.lng },
            icon: {
              url: iconUrlForPin(pin),
              scaledSize: new google.maps.Size(ICON_PX, ICON_PX),
            },
          });
          marker.addListener("click", () => showPinInfo(pin, marker));
          // Right-clicking directly on a pin (as opposed to empty map) would
          // otherwise be swallowed by the marker instead of reaching the
          // map's own "rightclick" listener below — forward it manually so
          // new-lead creation works even on a packed, cluster-heavy map.
          marker.addListener("rightclick", () => {
            void openNewLeadPanel(new google.maps.LatLng(pin.lat, pin.lng));
          });
          markersRef.current.set(`${pin.board}:${pin.itemId}`, marker);
          return marker;
        });

        const renderer: ClusterRenderer = {
          render: ({ count, position }) => {
            // Ripple look (matches SalesRabbit's real map): a dense core
            // circle carrying the count, surrounded by a distinctly more
            // translucent outer ring — not one flat single-opacity fill.
            // Both radii grow with the pin count (log scale so it doesn't
            // blow up on a 1000+ cluster).
            const outer = Math.min(160, Math.max(44, 36 + 34 * Math.log10(count + 1)));
            const core = outer * 0.54;
            const fontSize = Math.min(20, Math.max(11, 11 + 3 * Math.log10(count + 1)));
            const half = outer / 2;
            const clusterMarker = new Marker({
              position,
              icon: {
                url:
                  "data:image/svg+xml;utf8," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${outer}" height="${outer}">` +
                      `<circle cx="${half}" cy="${half}" r="${half}" fill="#b4b2a9" fill-opacity="0.22"/>` +
                      `<circle cx="${half}" cy="${half}" r="${core / 2}" fill="#b4b2a9" fill-opacity="0.75" stroke="white" stroke-opacity="0.5"/>` +
                      `<text x="${half}" y="${half + fontSize * 0.35}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" fill="white" text-anchor="middle">${count}</text>` +
                    `</svg>`
                  ),
                scaledSize: new google.maps.Size(outer, outer),
                anchor: new google.maps.Point(half, half),
              },
              zIndex: 1000 + count,
            });
            // Same forwarding as individual pins — right-clicking a cluster
            // bubble should still let you drop a new lead at that spot.
            clusterMarker.addListener("rightclick", () => {
              void openNewLeadPanel(position);
            });
            return clusterMarker;
          },
        };

        clustererRef.current = new MarkerClusterer({ map, markers, renderer });
      };
      renderPinsRef.current = renderPins;

      // Load cached pins.
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        const res = await fetch("/api/pins", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.error(`[field-map] /api/pins returned ${res.status}`);
        } else {
          const data: { pins: Pin[] } = await res.json();
          console.log(`[field-map] Loaded ${data.pins.length} pins`);
          pinsRef.current = data.pins;
          renderPins(data.pins);
        }
      } catch (err) {
        console.error("[field-map] Failed to load pins:", err);
      }

      // Drop a new pin: long-press on touch (a held-still press picks up the
      // address; a held-and-dragged press is a pan and must not), right-click
      // on desktop — holding a mouse button "still" for 500ms is unreliable,
      // hand jitter alone drifts past the threshold. Google's map fires
      // mousedown/mouseup/dragstart uniformly for touch and mouse input.
      const openNewLeadPanel = async (latLng: google.maps.LatLng) => {
        const lat = latLng.lat();
        const lng = latLng.lng();
        pendingMarkerRef.current?.setMap(null);
        pendingMarkerRef.current = new Marker({
          position: { lat, lng },
          map,
          icon: { url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png" },
        });
        setPendingPoint({ lat, lng, address: null, loadingAddress: true });
        let address: string | null = null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          // Build from the structured fields, not display_name — display_name
          // leads with the nearest named place/business, not the actual
          // street address.
          const a = data.address ?? {};
          const street = [a.house_number, a.road].filter(Boolean).join(" ");
          const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb;
          address = [street, city, a.state, a.postcode].filter(Boolean).join(", ") || null;
        } catch {
          address = null;
        }
        setPendingPoint((p) => (p && p.lat === lat && p.lng === lng ? { ...p, address, loadingAddress: false } : p));
      };

      const DRAG_CANCEL_PX = 6;
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      let pressOrigin: { x: number; y: number } | null = null;
      let pressLatLng: google.maps.LatLng | null = null;

      const cancelPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressOrigin = null;
      };

      map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || !e.domEvent) return;
        const domEvent = e.domEvent as MouseEvent | TouchEvent;
        const point =
          "touches" in domEvent && domEvent.touches.length
            ? { x: domEvent.touches[0].clientX, y: domEvent.touches[0].clientY }
            : { x: (domEvent as MouseEvent).clientX, y: (domEvent as MouseEvent).clientY };
        pressOrigin = point;
        pressLatLng = e.latLng;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          if (pressLatLng) void openNewLeadPanel(pressLatLng);
        }, 500);
      });
      map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
        if (!pressOrigin || !e.domEvent) return;
        const domEvent = e.domEvent as MouseEvent | TouchEvent;
        const point =
          "touches" in domEvent && domEvent.touches.length
            ? { x: domEvent.touches[0].clientX, y: domEvent.touches[0].clientY }
            : { x: (domEvent as MouseEvent).clientX, y: (domEvent as MouseEvent).clientY };
        const dx = point.x - pressOrigin.x;
        const dy = point.y - pressOrigin.y;
        if (Math.hypot(dx, dy) > DRAG_CANCEL_PX) cancelPress();
      });
      map.addListener("mouseup", cancelPress);
      map.addListener("dragstart", cancelPress); // map itself started panning — definitely not a long-press

      map.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) void openNewLeadPanel(e.latLng);
      });

      // Nearby-business search: fires after the view holds still for a few
      // seconds, and only if the toggle is on. Cached per rounded
      // center+zoom so revisiting a spot doesn't re-query. Also runs
      // immediately when the toggle is switched on (see runNearbySearchRef
      // below) — an "idle" event only fires on the *next* pan/zoom, so
      // without this, turning the toggle on while the map sits still would
      // never search at all.
      const runNearbySearch = async () => {
          if (!showNearbyRef.current) return;
          const center = map.getCenter();
          const zoom = map.getZoom();
          if (!center || zoom == null) return;
          const key = nearbyCacheKey(center, zoom);

          let results = nearbyCache.get(key);
          if (!results) {
            const bounds = map.getBounds();
            let radius = 1500;
            if (bounds) {
              const ne = bounds.getNorthEast();
              radius = Math.min(50000, google.maps.geometry.spherical.computeDistanceBetween(center, ne));
            }
            try {
              const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
              const { places } = await Place.searchNearby({
                fields: ["displayName", "location", "formattedAddress"],
                locationRestriction: { center, radius },
                maxResultCount: 20,
              });
              results = places
                .filter((p) => p.location)
                .map((p) => ({
                  name: p.displayName ?? "Unknown",
                  lat: p.location!.lat(),
                  lng: p.location!.lng(),
                  address: p.formattedAddress ?? null,
                }));
              nearbyCache.set(key, results);
            } catch (err) {
              console.error("[field-map] Nearby search failed:", err);
              return;
            }
          }

          if (!showNearbyRef.current) return; // toggled off while the search was in flight
          nearbyMarkersRef.current.forEach((m) => m.setMap(null));
          nearbyMarkersRef.current = results.map((biz) => {
            const marker = new Marker({
              position: { lat: biz.lat, lng: biz.lng },
              map,
              icon: {
                url:
                  "data:image/svg+xml;utf8," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="6" fill="#9ca3af" stroke="white" stroke-width="1.5"/></svg>`
                  ),
                scaledSize: new google.maps.Size(14, 14),
              },
              zIndex: 1,
            });
            marker.addListener("click", () => {
              infoWindow.setContent(
                `<div style="min-width:160px">
                   <div style="font-weight:600;color:#171717">${biz.name}</div>
                   ${biz.address ? `<div style="font-size:13px;color:#737373">${biz.address}</div>` : ""}
                 </div>`
              );
              infoWindow.open({ map, anchor: marker });
            });
            return marker;
          });
      };
      runNearbySearchRef.current = runNearbySearch;

      map.addListener("idle", () => {
        if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
        nearbyDebounceRef.current = setTimeout(runNearbySearch, NEARBY_DEBOUNCE_MS);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [salesman, googleMapsApiKey]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [mapType]);

  useEffect(() => {
    territoryOverlayRef.current?.setMap(showTerritory ? mapRef.current : null);
  }, [showTerritory]);

  useEffect(() => {
    visibleBoardsRef.current = visibleBoards;
    renderPinsRef.current?.(pinsRef.current);
  }, [visibleBoards]);

  useEffect(() => {
    visibleSalesmenRef.current = visibleSalesmen;
    renderPinsRef.current?.(pinsRef.current);
  }, [visibleSalesmen]);

  const toggleSalesman = (salesmanBucket: SalesmanBucket) => {
    setVisibleSalesmen((prev) => {
      const next = new Set(prev);
      if (next.has(salesmanBucket)) next.delete(salesmanBucket);
      else next.add(salesmanBucket);
      return next;
    });
  };

  const toggleBoard = (board: string) => {
    setVisibleBoards((prev) => {
      const next = new Set(prev);
      if (next.has(board)) next.delete(board);
      else next.add(board);
      return next;
    });
  };

  const chooseSalesman = (name: string) => {
    window.localStorage.setItem("fsm_salesman", name);
    setSalesman(name);
  };

  const submitDeal = async () => {
    if (!pendingPoint) return;
    // No business name typed? Fall back to just the street address.
    const streetOnly = pendingPoint.address?.split(",")[0]?.trim();
    const name = dealName.trim() || streetOnly;
    if (!name) return;

    setSaving(true);
    const res = await fetch("/api/create-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        address: pendingPoint.address,
        salesman,
        note: dealNote || undefined,
        status: dealStatus,
      }),
    });
    const result = await res.json();
    setSaving(false);
    pendingMarkerRef.current?.setMap(null);
    pendingMarkerRef.current = null;

    // Drop the new pin straight into the map so it doesn't look like the
    // save silently did nothing — matters a lot to a salesman in the field.
    const map = mapRef.current;
    if (result.ok && map) {
      const newPin: Pin = {
        board: "salesrabbit",
        tier: 3,
        itemId: result.itemId,
        name,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        address: pendingPoint.address,
        status: dealStatus,
        stage: null,
        salesman: normalizeSalesmanClient(salesman),
      };
      pinsRef.current = [...pinsRef.current, newPin];
      if (visibleBoardsRef.current.has(newPin.board) && visibleSalesmenRef.current.has(newPin.salesman)) {
        const marker = new google.maps.Marker({
          position: { lat: newPin.lat, lng: newPin.lng },
          icon: {
            url: iconUrlForPin(newPin),
            scaledSize: new google.maps.Size(window.innerWidth >= 1024 ? 40 : 30, window.innerWidth >= 1024 ? 40 : 30),
          },
        });
        markersRef.current.set(`${newPin.board}:${newPin.itemId}`, marker);
        clustererRef.current?.addMarker(marker);
      }
    }

    setPendingPoint(null);
    setDealName("");
    setDealNote("");
    setDealStatus(STATUS_OPTIONS[0]);
  };

  const cancelPendingPoint = () => {
    pendingMarkerRef.current?.setMap(null);
    pendingMarkerRef.current = null;
    setPendingPoint(null);
    setDealName("");
    setDealNote("");
    setDealStatus(STATUS_OPTIONS[0]);
  };

  if (!salesman) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-neutral-100 p-6">
        <h1 className="text-lg font-semibold">Who&apos;s using the app?</h1>
        {SALESMEN.map((s) => (
          <button
            key={s}
            onClick={() => chooseSalesman(s)}
            className="w-48 rounded-lg bg-neutral-900 py-3 text-white"
          >
            {s}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full">
      <div ref={mapContainer} className="h-full w-full" />

      <img
        src="/provident-logo.png"
        alt="Provident LED"
        className="absolute bottom-3 left-3 z-10 h-14 w-auto drop-shadow-lg"
      />

      <input
        ref={searchInputRef}
        type="text"
        placeholder="Search an address or business…"
        className="absolute left-3 right-3 top-3 z-10 rounded-lg border-0 bg-white px-3 py-2 text-sm text-neutral-900 shadow-lg placeholder:text-neutral-400 sm:right-auto sm:w-72"
      />

      <div className="absolute right-3 top-16 z-10 flex overflow-hidden rounded-lg shadow-lg sm:top-3">
        <button
          onClick={() => setMapType("roadmap")}
          className={`px-3 py-2 text-sm font-medium ${
            mapType === "roadmap" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Streets
        </button>
        <button
          onClick={() => setMapType("satellite")}
          className={`px-3 py-2 text-sm font-medium ${
            mapType === "satellite" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => setMapType("hybrid")}
          className={`px-3 py-2 text-sm font-medium ${
            mapType === "hybrid" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Hybrid
        </button>
      </div>

      <button
        onClick={() => setShowTerritory((v) => !v)}
        className={`absolute right-3 top-28 z-10 rounded-lg px-3 py-2 text-sm font-medium shadow-lg sm:top-14 ${
          showTerritory ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
        }`}
      >
        Territory
      </button>

      <button
        onClick={() => setShowNearby((v) => !v)}
        className={`absolute right-3 top-40 z-10 rounded-lg px-3 py-2 text-sm font-medium shadow-lg sm:top-24 ${
          showNearby ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
        }`}
      >
        Nearby
      </button>

      <div className="absolute right-3 top-52 z-10 sm:top-36">
        <button
          onClick={() => setBoardFilterOpen((v) => !v)}
          className={`rounded-lg px-3 py-2 text-sm font-medium shadow-lg ${
            boardFilterOpen ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Boards
        </button>
        {boardFilterOpen && (
          <div className="absolute right-0 mt-1 w-44 rounded-lg bg-white p-2 shadow-lg">
            {ALL_BOARDS.map((board) => (
              <label
                key={board}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                <input
                  type="checkbox"
                  checked={visibleBoards.has(board)}
                  onChange={() => toggleBoard(board)}
                />
                {BOARD_LABELS[board]}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="absolute right-3 top-64 z-10 sm:top-48">
        <button
          onClick={() => setSalesmanFilterOpen((v) => !v)}
          className={`rounded-lg px-3 py-2 text-sm font-medium shadow-lg ${
            salesmanFilterOpen ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Salesmen
        </button>
        {salesmanFilterOpen && (
          <div className="absolute right-0 mt-1 w-44 rounded-lg bg-white p-2 shadow-lg">
            {SALESMAN_FILTERS.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                <input type="checkbox" checked={visibleSalesmen.has(s)} onChange={() => toggleSalesman(s)} />
                {s}
              </label>
            ))}
          </div>
        )}
      </div>

      {pendingPoint && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-4 shadow-lg sm:inset-x-auto sm:bottom-3 sm:left-3 sm:w-80 sm:rounded-2xl">
          <div className="mb-1 text-sm text-neutral-500">New lead — {salesman}</div>
          <input
            className="mb-3 w-full rounded border px-3 py-2 text-sm text-neutral-700"
            placeholder={pendingPoint.loadingAddress ? "Looking up address…" : "Address (edit if needed)"}
            value={pendingPoint.address ?? ""}
            disabled={pendingPoint.loadingAddress}
            onChange={(e) => setPendingPoint((p) => (p ? { ...p, address: e.target.value } : p))}
          />
          <input
            className="mb-3 w-full rounded border px-3 py-2"
            placeholder="Business / customer name (optional — defaults to the street address)"
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            autoFocus
          />
          <textarea
            className="mb-3 w-full rounded border px-3 py-2 text-sm"
            placeholder="Note (optional)"
            rows={2}
            value={dealNote}
            onChange={(e) => setDealNote(e.target.value)}
          />
          <div className="relative mb-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded border px-3 py-2 text-sm text-neutral-700"
              onClick={() => setStatusMenuOpen((v) => !v)}
            >
              <img src={statusIconDataUri(dealStatus)} alt="" className="h-5 w-5 rounded" />
              <span className="flex-1 text-left">{dealStatus}</span>
              <span className="text-neutral-400">▾</span>
            </button>
            {statusMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)} />
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white shadow-lg">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                        s === dealStatus ? "bg-neutral-50 font-medium" : ""
                      }`}
                      onClick={() => {
                        setDealStatus(s);
                        setStatusMenuOpen(false);
                      }}
                    >
                      <img src={statusIconDataUri(s)} alt="" className="h-5 w-5 rounded" />
                      <span>{s}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button className="flex-1 rounded bg-neutral-200 py-2" onClick={cancelPendingPoint}>
              Cancel
            </button>
            <button
              className="flex-1 rounded bg-green-600 py-2 text-white disabled:opacity-50"
              disabled={(!dealName && !pendingPoint.address) || saving || pendingPoint.loadingAddress}
              onClick={submitDeal}
            >
              {saving ? "Saving…" : "Create Lead"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
