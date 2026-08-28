"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
}

const BOARD_COLORS: Record<string, string> = {
  deals: "#16a34a", // green — live deal
  old_cashflow: "#2563eb", // blue — historical customer
  pipedrive: "#7c3aed", // purple — historical lead
  salesrabbit: "#f59e0b", // amber — canvassed lead
};

// Monday board IDs, for building "Open in Monday" links from the popup.
const MONDAY_WORKSPACE_URL = "https://providentled-company.monday.com";
const BOARD_IDS: Record<string, number> = {
  deals: 1558281108,
  old_cashflow: 5102612766,
  pipedrive: 5102614839,
  salesrabbit: 5099562913,
};

const SALESMEN = ["Yoel", "Ari", "Chuny", "Shragie", "Neil", "JJ"];

// Free, no-API-key raster basemaps. Streets and satellite are both defined
// as sources up front and toggled via layer visibility (not map.setStyle),
// so switching never disturbs the pins/clusters layers sitting on top.
const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, HERE, Garmin, FAO, NOAA, USGS",
    },
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "streets-layer", type: "raster", source: "streets", layout: { visibility: "visible" } },
    { id: "satellite-layer", type: "raster", source: "satellite", layout: { visibility: "none" } },
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
  color_mkv0qrwq: "Salesman",
  deal_stage: "Stage",
  long_text_mm6khzqt: "Sales Notes",
};

export default function FieldMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [salesman, setSalesman] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{
    lat: number;
    lng: number;
    address: string | null;
    loadingAddress: boolean;
  } | null>(null);
  const [dealName, setDealName] = useState("");
  const [saving, setSaving] = useState(false);
  const [baseStyle, setBaseStyle] = useState<"streets" | "satellite">("streets");

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

      map.addSource("pins", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pins",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#dc2626",
          "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 200, 28],
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

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "board"],
            "deals", BOARD_COLORS.deals,
            "old_cashflow", BOARD_COLORS.old_cashflow,
            "pipedrive", BOARD_COLORS.pipedrive,
            "salesrabbit", BOARD_COLORS.salesrabbit,
            "#999",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.on("click", "unclustered-point", (e) => {
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
      });

      // Drop a new pin: long-press on touch (a held-still press picks up the
      // address; a held-and-dragged press is a pan and must not), right-click
      // on desktop — holding a mouse button "still" for 500ms is unreliable,
      // hand jitter alone crosses a few pixels and reads as a drag.
      const openNewLeadPanel = async (lngLat: maplibregl.LngLat) => {
        const { lat, lng } = lngLat;
        setPendingPoint({ lat, lng, address: null, loadingAddress: true });
        let address: string | null = null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          address = data.display_name ?? null;
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
      map.setLayoutProperty("streets-layer", "visibility", baseStyle === "streets" ? "visible" : "none");
      map.setLayoutProperty("satellite-layer", "visibility", baseStyle === "satellite" ? "visible" : "none");
    };
    if (map.isStyleLoaded()) applyVisibility();
    else map.once("load", applyVisibility);
  }, [baseStyle]);

  const chooseSalesman = (name: string) => {
    window.localStorage.setItem("fsm_salesman", name);
    setSalesman(name);
  };

  const submitDeal = async () => {
    if (!pendingPoint || !dealName) return;
    setSaving(true);
    await fetch("/api/create-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: dealName,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        address: pendingPoint.address,
        salesman,
      }),
    });
    setSaving(false);
    setPendingPoint(null);
    setDealName("");
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
      </div>

      {pendingPoint && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-4 shadow-lg">
          <div className="mb-1 text-sm text-neutral-500">New lead — {salesman}</div>
          <div className="mb-3 text-sm font-medium text-neutral-800">
            {pendingPoint.loadingAddress
              ? "Looking up address…"
              : pendingPoint.address ?? "Couldn't look up an address — you can still save this pin."}
          </div>
          <input
            className="mb-3 w-full rounded border px-3 py-2"
            placeholder="Business / customer name"
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              className="flex-1 rounded bg-neutral-200 py-2"
              onClick={() => setPendingPoint(null)}
            >
              Cancel
            </button>
            <button
              className="flex-1 rounded bg-green-600 py-2 text-white disabled:opacity-50"
              disabled={!dealName || saving || pendingPoint.loadingAddress}
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
