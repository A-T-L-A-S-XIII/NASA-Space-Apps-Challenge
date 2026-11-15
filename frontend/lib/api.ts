import type { LayerSet, Localities, Stats, Timeline } from "./types";

// With NEXT_PUBLIC_API_BASE (e.g. http://localhost:8000/api) the app calls the
// FastAPI server. Without it, it reads the static export in public/api/, so
// the demo runs on static hosting with no server.
const SERVER = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "");
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STATIC = `${BASE_PATH}/api`;

function endpoint(path: string): string {
  return SERVER ? `${SERVER}/${path}` : `${STATIC}/${path}.json`;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return (await r.json()) as T;
}

export const api = {
  timeline: () => getJson<Timeline>(endpoint("timeline")),
  layers: (dateId: string) => getJson<LayerSet>(endpoint(`layers/${encodeURIComponent(dateId)}`)),
  stats: () => getJson<Stats>(endpoint("stats")),
  localities: () => getJson<Localities>(endpoint("localities")),
  aoi: () => getJson<GeoJSON.FeatureCollection>(endpoint("aoi")),
  fileUrl: (rel: string) => (SERVER ? `${SERVER}/files/${rel}` : `${STATIC}/files/${rel}`),
  downloadUrl: (kind: "geojson" | "csv" | "png", dateId?: string) => {
    if (SERVER) return `${SERVER}/download/${kind}${dateId ? `?date_id=${dateId}` : ""}`;
    if (kind === "png") return `${STATIC}/files/layers/${dateId}_water.png`;
    return `${STATIC}/download/stats.${kind}`;
  },
};
