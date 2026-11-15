"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { BBox, LayerSet, Locality } from "@/lib/types";

export interface MapViewProps {
  bbox: BBox;
  layerSets: LayerSet[];
  currentDateId: string | null;
  showWater: boolean;
  showChange: boolean;
  localities: Locality[];
  flyTo: { lat: number; lon: number; key: number } | null;
}

const corners = ([w, s, e, n]: BBox): [[number, number], [number, number], [number, number], [number, number]] => [
  [w, n], [e, n], [e, s], [w, s],
];

// Online basemap with attribution; when tiles cannot load (offline), the
// background colour, AOI outline and locality points still render.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e9edf1" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6, "raster-opacity": 0.85 } },
  ],
};

export default function MapView(p: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      bounds: [[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]],
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    m.on("error", (e: unknown) => {
      if ((e as { sourceId?: string }).sourceId === "osm") setOffline(true);
    });
    m.on("load", async () => {
      try {
        m.addSource("aoi", { type: "geojson", data: await api.aoi() });
        m.addLayer({ id: "aoi", type: "line", source: "aoi", paint: { "line-color": "#1b2733", "line-width": 1.5, "line-dasharray": [3, 2] } });
      } catch {
        /* AOI outline is optional decoration */
      }
      setReady(true);
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One image source per date and kind, so switching dates only flips visibility.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const ls of p.layerSets) {
      for (const layer of ls.layers) {
        const id = `${ls.date_id}-${layer.kind}`;
        if (m.getSource(id)) continue;
        m.addSource(id, { type: "image", url: api.fileUrl(layer.url), coordinates: corners(ls.bounds) });
        m.addLayer(
          { id, type: "raster", source: id, layout: { visibility: "none" }, paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 } },
          m.getLayer("aoi") ? "aoi" : undefined,
        );
      }
    }
  }, [ready, p.layerSets]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const ls of p.layerSets) {
      for (const layer of ls.layers) {
        const id = `${ls.date_id}-${layer.kind}`;
        if (!m.getLayer(id)) continue;
        const on = ls.date_id === p.currentDateId && (layer.kind === "water" ? p.showWater : p.showChange);
        m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      }
    }
  }, [ready, p.layerSets, p.currentDateId, p.showWater, p.showChange]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || p.localities.length === 0 || m.getSource("localities")) return;
    m.addSource("localities", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: p.localities.map((l) => ({
          type: "Feature",
          properties: { name: l.name },
          geometry: { type: "Point", coordinates: [l.lon, l.lat] },
        })),
      },
    });
    m.addLayer({
      id: "localities", type: "circle", source: "localities",
      paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": "#1b2733", "circle-stroke-width": 1.5 },
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    m.on("mouseenter", "localities", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = "pointer";
      popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setText(String(f.properties?.name)).addTo(m);
    });
    m.on("mouseleave", "localities", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });
  }, [ready, p.localities]);

  useEffect(() => {
    if (p.flyTo && map.current) map.current.flyTo({ center: [p.flyTo.lon, p.flyTo.lat], zoom: 12.5 });
  }, [p.flyTo]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="region" aria-label="Map of the study area" />
      {offline && <div className="map-note">Basemap unavailable offline — study area outline and radar layers still shown.</div>}
    </div>
  );
}
