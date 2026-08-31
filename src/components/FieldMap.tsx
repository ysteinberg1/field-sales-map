"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { statusIconDataUri, loadStatusIconImage } from "@/lib/statusIcons";
import { loadSourceBadgeImage } from "@/lib/sourceIcons";
import type { SourceBadgeKind } from "@/lib/sourceIcons";

// maplibre-gl resolves its worker script relative to its own bundled chunk's
// import.meta.url, which doesn't exist once Next.js/webpack bundles it into
// _next/static/chunks/*.js — that 404s and Vercel serves back HTML, which the
// browser then rejects as a module script ("non-JavaScript MIME type").
// Point it at the matching worker files we've vendored into public/ instead.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

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
}

// Monday board IDs, for building "Open in Monday" links from the popup.
const MONDAY_WORKSPACE_URL = "https://providentled-company.monday.com";
const BOARD_IDS: Record<string, number> = {
  deals: 1558281108,
  old_cashflow: 5102612766,
  pipedrive: 5102614839,
  salesrabbit: 5099562913,
};

const SALESMEN = ["Yoel", "Ari", "Chuny", "Shragie", "Neil", "JJ"];

// Utility-territory overlay, exported from the SalesRabbit Google Earth
// project (Provident_LED_-_Map_fixed.kmz) — a GroundOverlay PNG with a
// fixed lat/lng bounding box. Off by default, same as the KMZ's own folder.
const TERRITORY_IMAGE_URL = "/utility-territory.png";
const TERRITORY_BOUNDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-75.59305370948213, 41.40564881847246], // top-left (west, north)
  [-73.86066137494016, 41.40564881847246], // top-right (east, north)
  [-73.86066137494016, 38.880312151348846], // bottom-right (east, south)
  [-75.59305370948213, 38.880312151348846], // bottom-left (west, south)
];

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

// Free, no-API-key raster basemaps. Streets and satellite are both defined
// as sources up front and toggled via layer visibility (not map.setStyle),
// so switching never disturbs the pins/clusters layers sitting on top.
// "Streets" is Esri's Light Gray Canvas (muted gray/green, like SalesRabbit's
// map) — a base layer plus a separate reference layer for roads/labels.
const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "streets-base": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 16, // beyond this the service has no tiles and returns a "data not available" placeholder
      attribution: "© Esri",
    },
    "streets-reference": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 16,
    },
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
    // Roads/street names overlay for satellite imagery — "Hybrid" is this
    // plus the satellite layer both visible at once. World_Transportation
    // carries the actual road lines + street labels; Boundaries_and_Places
    // adds city/place names and borders on top of that.
    "hybrid-roads": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
    },
    "hybrid-places": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
    },
  },
  layers: [
    { id: "streets-base-layer", type: "raster", source: "streets-base", layout: { visibility: "visible" } },
    { id: "streets-reference-layer", type: "raster", source: "streets-reference", layout: { visibility: "visible" } },
    { id: "satellite-layer", type: "raster", source: "satellite", layout: { visibility: "none" } },
    { id: "hybrid-roads-layer", type: "raster", source: "hybrid-roads", layout: { visibility: "none" } },
    { id: "hybrid-places-layer", type: "raster", source: "hybrid-places", layout: { visibility: "none" } },
  ],
};

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
  date_mm6drq5j: "Sales Date",
  color_mkv0qrwq: "Salesman",
  deal_stage: "Stage",
  long_text_mm6khzqt: "Sales Notes",
};

export default function FieldMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pinsDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
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
  const [baseStyle, setBaseStyle] = useState<"streets" | "satellite" | "hybrid">("streets");
  const [showTerritory, setShowTerritory] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("fsm_salesman");
    if (saved) setSalesman(saved);
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASE_STYLE,
      center: [-74.15, 40.85], // NJ/NY fallback
      zoom: 10,
    });
    mapRef.current = map;

    map.on("load", async () => {
      // Center on the salesman's live location if they allow it.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
          },
          () => {
            /* denied or unavailable — keep the NJ/NY fallback view */
          }
        );
      }

      // Slightly bigger pin icons on desktop — a phone screen stays tight
      // so more pins fit without crowding, but a desktop has room to spare.
      const ICON_SIZE = window.innerWidth >= 1024 ? 1.15 : 0.8;

      // Utility-territory overlay — added early so it sits under the pins.
      map.addSource("utility-territory", {
        type: "image",
        url: TERRITORY_IMAGE_URL,
        coordinates: TERRITORY_BOUNDS,
      });
      map.addLayer({
        id: "utility-territory-layer",
        type: "raster",
        source: "utility-territory",
        paint: { "raster-opacity": 0.45 },
        layout: { visibility: "none" },
      });

      // Load cached pins
      let data: { pins: Pin[] };
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        const res = await fetch("/api/pins", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          console.error(`[field-map] /api/pins returned ${res.status}`);
          return;
        }
        data = await res.json();
      } catch (err) {
        console.error("[field-map] Failed to load pins:", err);
        return;
      }
      const pins: Pin[] = data.pins;
      console.log(`[field-map] Loaded ${pins.length} pins`);

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: pins.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { ...p },
        })),
      };
      pinsDataRef.current = geojson;

      map.addSource("pins", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 70, // fewer, bigger cluster bubbles instead of many small overlapping ones
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pins",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#dc2626",
          "circle-radius": ["step", ["get", "point_count"], 14, 50, 20, 200, 26],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pins",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": "#fff" },
      });

      // Deals/Old Cashflow/Pipedrive don't carry a lead status, so they get
      // a source badge instead: Pipedrive Archive items show a Pipedrive
      // mark, everything else shows a Monday mark — except any item whose
      // Stage/Status is exactly "Won", which shows a green check instead
      // (confirmed as a real label on both boards' stage columns).
      // SalesRabbit leads get their own status-icon symbol layer below.
      const sourceBadgeKinds: SourceBadgeKind[] = ["pipedrive", "monday", "won"];
      await Promise.all(
        sourceBadgeKinds.map(async (kind) => {
          const id = `source-icon-${kind}`;
          if (!map.hasImage(id)) {
            const img = await loadSourceBadgeImage(kind);
            map.addImage(id, img, { pixelRatio: 2 });
          }
        })
      );

      map.addLayer({
        id: "unclustered-point",
        type: "symbol",
        source: "pins",
        filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "board"], "salesrabbit"]],
        layout: {
          "icon-image": [
            "case",
            ["==", ["get", "stage"], "Won"], "source-icon-won",
            ["==", ["get", "board"], "pipedrive"], "source-icon-pipedrive",
            "source-icon-monday",
          ],
          "icon-size": ICON_SIZE,
          "icon-allow-overlap": true,
        },
      });

      // One small flat-icon image per SalesRabbit status, matching
      // SalesRabbit's own icon style (see src/lib/statusIcons.ts).
      await Promise.all(
        [...STATUS_OPTIONS, "__default__"].map(async (s) => {
          const id = `status-icon-${s}`;
          if (!map.hasImage(id)) {
            const img = await loadStatusIconImage(s);
            map.addImage(id, img, { pixelRatio: 2 });
          }
        })
      );

      map.addLayer({
        id: "salesrabbit-points",
        type: "symbol",
        source: "pins",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "board"], "salesrabbit"]],
        layout: {
          // maplibre's StyleSpecification types expect a fixed-length "match"
          // tuple, which a dynamically-spread expression can't satisfy
          // statically — the shape (condition/output pairs + fallback) is
          // correct at runtime, so this is a deliberate escape hatch.
          "icon-image": [
            "match",
            ["get", "status"],
            ...STATUS_OPTIONS.flatMap((s) => [s, `status-icon-${s}`]),
            "status-icon-__default__",
          ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "icon-size": ICON_SIZE,
          "icon-allow-overlap": true,
        },
      });

      const showPinPopup = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as any;
        // One popup instance, updated in place — a second `new Popup()` here
        // would stack on top of the first instead of replacing it.
        const popup = new maplibregl.Popup()
          .setLngLat((feature.geometry as any).coordinates)
          .setHTML(
            `<div class="min-w-[200px]">
               <div class="font-semibold text-neutral-900">${props.name}</div>
               ${props.address ? `<div class="text-sm text-neutral-500">${props.address}</div>` : ""}
               <div class="mt-1 text-sm italic text-neutral-400">Loading details…</div>
             </div>`
          )
          .addTo(map);

        fetch(`/api/item/${props.itemId}?board=${props.board}`)
          .then((r) => r.json())
          .then((full) => {
            const rows = Object.entries(full.details)
              .filter(([, v]) => v)
              .map(
                ([k, v]) =>
                  `<div><span class="text-neutral-400">${FIELD_LABELS[k] ?? k}:</span> ${v}</div>`
              )
              .join("");
            const boardId = BOARD_IDS[props.board];
            const mondayUrl = `${MONDAY_WORKSPACE_URL}/boards/${boardId}/pulses/${props.itemId}`;
            popup.setHTML(
              `<div class="min-w-[200px]">
                 <div class="mb-1 font-semibold text-neutral-900">${full.name}</div>
                 <div class="space-y-0.5 text-sm text-neutral-700">${rows}</div>
                 <a href="${mondayUrl}" target="_blank" rel="noopener noreferrer"
                    class="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                   Open in Monday →
                 </a>
               </div>`
            );
          });
      };

      map.on("click", "unclustered-point", showPinPopup);
      map.on("click", "salesrabbit-points", showPinPopup);

      // A pointer cursor over pins/clusters signals they're clickable —
      // maplibre doesn't do this on its own.
      const clickableLayers = ["unclustered-point", "salesrabbit-points", "clusters"];
      for (const layerId of clickableLayers) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      // Drop a new pin: long-press on touch (a held-still press picks up the
      // address; a held-and-dragged press is a pan and must not), right-click
      // on desktop — holding a mouse button "still" for 500ms is unreliable,
      // hand jitter alone crosses a few pixels and reads as a drag.
      const openNewLeadPanel = async (lngLat: maplibregl.LngLat) => {
        const { lat, lng } = lngLat;
        pendingMarkerRef.current?.remove();
        pendingMarkerRef.current = new maplibregl.Marker({ color: "#16a34a" }).setLngLat(lngLat).addTo(map);
        setPendingPoint({ lat, lng, address: null, loadingAddress: true });
        let address: string | null = null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          // Build from the structured fields, not display_name — display_name
          // leads with the nearest named place/business ("School of Social
          // Work - Newark, 33, Washington Street, ..."), which isn't the
          // street address and isn't ours to claim as one.
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

      const cancelPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressOrigin = null;
      };

      const startPress = (point: { x: number; y: number }, lngLat: maplibregl.LngLat) => {
        pressOrigin = point;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          void openNewLeadPanel(lngLat);
        }, 500);
      };

      const checkDrag = (point: { x: number; y: number }) => {
        if (!pressOrigin) return;
        const dx = point.x - pressOrigin.x;
        const dy = point.y - pressOrigin.y;
        if (Math.hypot(dx, dy) > DRAG_CANCEL_PX) cancelPress();
      };

      map.on("touchstart", (e) => startPress(e.point, e.lngLat));
      map.on("touchmove", (e) => checkDrag(e.point));
      map.on("touchend", cancelPress);
      map.on("dragstart", cancelPress); // map itself started panning — definitely not a long-press

      map.on("contextmenu", (e) => {
        e.preventDefault();
        void openNewLeadPanel(e.lngLat);
      });
    });
  }, [salesman]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyVisibility = () => {
      const streetsVisible = baseStyle === "streets" ? "visible" : "none";
      map.setLayoutProperty("streets-base-layer", "visibility", streetsVisible);
      map.setLayoutProperty("streets-reference-layer", "visibility", streetsVisible);
      // Hybrid is satellite imagery plus the roads/labels reference layer.
      const satelliteVisible = baseStyle === "satellite" || baseStyle === "hybrid" ? "visible" : "none";
      map.setLayoutProperty("satellite-layer", "visibility", satelliteVisible);
      const hybridVisible = baseStyle === "hybrid" ? "visible" : "none";
      map.setLayoutProperty("hybrid-roads-layer", "visibility", hybridVisible);
      map.setLayoutProperty("hybrid-places-layer", "visibility", hybridVisible);
    };
    if (map.isStyleLoaded()) applyVisibility();
    else map.once("load", applyVisibility);
  }, [baseStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyVisibility = () => {
      if (!map.getLayer("utility-territory-layer")) return;
      map.setLayoutProperty("utility-territory-layer", "visibility", showTerritory ? "visible" : "none");
    };
    if (map.isStyleLoaded()) applyVisibility();
    else map.once("load", applyVisibility);
  }, [showTerritory]);

  const chooseSalesman = (name: string) => {
    window.localStorage.setItem("fsm_salesman", name);
    setSalesman(name);
  };

  const submitDeal = async () => {
    if (!pendingPoint) return;
    // No business name typed? Fall back to just the street address (e.g.
    // "33 Washington Street") rather than blocking the save on it.
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
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;

    // Drop the new pin straight into the map so it doesn't look like the
    // save silently did nothing — matters a lot to a salesman in the field.
    const map = mapRef.current;
    if (result.ok && map && pinsDataRef.current) {
      const newFeature: GeoJSON.Feature = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [pendingPoint.lng, pendingPoint.lat] },
        properties: {
          board: "salesrabbit",
          tier: 3,
          itemId: result.itemId,
          name,
          lat: pendingPoint.lat,
          lng: pendingPoint.lng,
          address: pendingPoint.address,
          status: dealStatus,
        },
      };
      pinsDataRef.current = {
        ...pinsDataRef.current,
        features: [...pinsDataRef.current.features, newFeature],
      };
      (map.getSource("pins") as maplibregl.GeoJSONSource | undefined)?.setData(pinsDataRef.current);
    }

    setPendingPoint(null);
    setDealName("");
    setDealNote("");
    setDealStatus(STATUS_OPTIONS[0]);
  };

  const cancelPendingPoint = () => {
    pendingMarkerRef.current?.remove();
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
        className="absolute left-3 top-3 z-10 h-14 w-auto drop-shadow-lg"
      />

      <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-lg shadow-lg">
        <button
          onClick={() => setBaseStyle("streets")}
          className={`px-3 py-2 text-sm font-medium ${
            baseStyle === "streets" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Streets
        </button>
        <button
          onClick={() => setBaseStyle("satellite")}
          className={`px-3 py-2 text-sm font-medium ${
            baseStyle === "satellite" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => setBaseStyle("hybrid")}
          className={`px-3 py-2 text-sm font-medium ${
            baseStyle === "hybrid" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
          }`}
        >
          Hybrid
        </button>
      </div>

      <button
        onClick={() => setShowTerritory((v) => !v)}
        className={`absolute right-3 top-14 z-10 rounded-lg px-3 py-2 text-sm font-medium shadow-lg ${
          showTerritory ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
        }`}
      >
        Territory
      </button>

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
