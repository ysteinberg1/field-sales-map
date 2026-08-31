"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Renderer as ClusterRenderer } from "@googlemaps/markerclusterer";
import { statusIconDataUri } from "@/lib/statusIcons";
import { sourceBadgeDataUri } from "@/lib/sourceIcons";

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
  date_mm6drq5j: "Sales Date",
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
  if (p.stage === "Won") return sourceBadgeDataUri("won");
  if (p.board === "pipedrive") return sourceBadgeDataUri("pipedrive");
  return sourceBadgeDataUri("monday");
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
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const [mapType, setMapType] = useState<"roadmap" | "satellite" | "hybrid">("roadmap");
  const [showTerritory, setShowTerritory] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

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
        mapTypeId: "roadmap",
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

      const showPinInfo = (pin: Pin, marker: google.maps.Marker) => {
        infoWindow.setContent(
          `<div style="min-width:200px">
             <div style="font-weight:600;color:#171717">${pin.name}</div>
             ${pin.address ? `<div style="font-size:13px;color:#737373">${pin.address}</div>` : ""}
             <div style="margin-top:4px;font-size:13px;font-style:italic;color:#a3a3a3">Loading details…</div>
           </div>`
        );
        infoWindow.open({ map, anchor: marker });

        fetch(`/api/item/${pin.itemId}?board=${pin.board}`)
          .then((r) => r.json())
          .then((full) => {
            const rows = Object.entries(full.details)
              .filter(([, v]) => v)
              .map(([k, v]) => `<div><span style="color:#a3a3a3">${FIELD_LABELS[k] ?? k}:</span> ${v}</div>`)
              .join("");
            const boardId = BOARD_IDS[pin.board];
            const mondayUrl = `${MONDAY_WORKSPACE_URL}/boards/${boardId}/pulses/${pin.itemId}`;
            infoWindow.setContent(
              `<div style="min-width:200px">
                 <div style="margin-bottom:4px;font-weight:600;color:#171717">${full.name}</div>
                 <div style="font-size:13px;color:#404040;line-height:1.4">${rows}</div>
                 <a href="${mondayUrl}" target="_blank" rel="noopener noreferrer"
                    style="margin-top:8px;display:inline-block;font-size:13px;font-weight:500;color:#2563eb">
                   Open in Monday →
                 </a>
               </div>`
            );
          });
      };

      const renderPins = (pins: Pin[]) => {
        clustererRef.current?.clearMarkers();
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = new Map();

        const markers = pins.map((pin) => {
          const marker = new Marker({
            position: { lat: pin.lat, lng: pin.lng },
            icon: {
              url: iconUrlForPin(pin),
              scaledSize: new google.maps.Size(ICON_PX, ICON_PX),
            },
          });
          marker.addListener("click", () => showPinInfo(pin, marker));
          markersRef.current.set(`${pin.board}:${pin.itemId}`, marker);
          return marker;
        });

        const renderer: ClusterRenderer = {
          render: ({ count, position }) =>
            new Marker({
              position,
              icon: {
                url:
                  "data:image/svg+xml;utf8," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><circle cx="26" cy="26" r="22" fill="#dc2626" fill-opacity="0.85"/><text x="26" y="31" font-family="sans-serif" font-size="14" fill="white" text-anchor="middle">${count}</text></svg>`
                  ),
                scaledSize: new google.maps.Size(52, 52),
              },
              zIndex: 1000 + count,
            }),
        };

        clustererRef.current = new MarkerClusterer({ map, markers, renderer });
      };

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

      // Nearby-business search: fires only after the view holds still for a
      // few seconds, and only if the toggle is on. Cached per rounded
      // center+zoom so revisiting a spot doesn't re-query.
      map.addListener("idle", () => {
        if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
        nearbyDebounceRef.current = setTimeout(async () => {
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
        }, NEARBY_DEBOUNCE_MS);
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
      };
      pinsRef.current = [...pinsRef.current, newPin];
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
        className="absolute left-3 top-3 z-10 h-14 w-auto drop-shadow-lg"
      />

      <input
        ref={searchInputRef}
        type="text"
        placeholder="Search an address or business…"
        className="absolute left-20 right-3 top-3 z-10 rounded-lg border-0 px-3 py-2 text-sm shadow-lg sm:left-20 sm:right-auto sm:w-72"
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
