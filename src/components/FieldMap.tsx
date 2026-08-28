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
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
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
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);
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
        new maplibregl.Popup()
          .setLngLat((feature.geometry as any).coordinates)
          .setHTML(
            `<strong>${props.name}</strong><br/>${props.address ?? ""}<br/><em>loading details…</em>`
          )
          .addTo(map);

        fetch(`/api/item/${props.itemId}?board=${props.board}`)
          .then((r) => r.json())
          .then((full) => {
            const rows = Object.entries(full.details)
              .filter(([, v]) => v)
              .map(([k, v]) => `<div>${FIELD_LABELS[k] ?? k}: ${v}</div>`)
              .join("");
            const boardId = BOARD_IDS[props.board];
            const mondayUrl = `${MONDAY_WORKSPACE_URL}/boards/${boardId}/pulses/${props.itemId}`;
            new maplibregl.Popup()
              .setLngLat((feature.geometry as any).coordinates)
              .setHTML(
                `<strong>${full.name}</strong>${rows}<div style="margin-top:8px"><a href="${mondayUrl}" target="_blank" rel="noopener noreferrer">Open in Monday →</a></div>`
              )
              .addTo(map);
          });
      });

      // Long-press / click on empty map to drop a new pin
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      map.on("mousedown", (e) => {
        pressTimer = setTimeout(() => {
          setPendingPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        }, 500);
      });
      map.on("mouseup", () => {
        if (pressTimer) clearTimeout(pressTimer);
      });
      map.on("touchstart", (e) => {
        pressTimer = setTimeout(() => {
          setPendingPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        }, 500);
      });
      map.on("touchend", () => {
        if (pressTimer) clearTimeout(pressTimer);
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
          <div className="mb-2 text-sm text-neutral-500">New lead — {salesman}</div>
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
              disabled={!dealName || saving}
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
