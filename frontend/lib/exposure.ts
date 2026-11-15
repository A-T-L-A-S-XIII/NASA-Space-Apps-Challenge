// Mirror of backend/app/services/exposure.py for the static (serverless) demo.
// Keep both in sync: `node scripts/check-exposure.ts` compares this code with
// the Python answers exported to public/api/exposure-samples.json.
import type { Timeline } from "./types";

export type ObservedState = "candidate_water" | "no_candidate_water" | "no_valid_observation";
export type AccessStatus = "interruption_confirmed" | "section_requiring_verification" | "isolation_not_demonstrated";
export type Basis = "radar" | "external" | "inference";

export interface Statement { text: string; basis: Basis; source: string; time: string | null }

export interface Exposure {
  fixture: boolean;
  lat: number;
  lon: number;
  inside_aoi: boolean;
  latest: { date_id: string; sensor: string; acquisition_time: string; state: ObservedState } | null;
  history: { k: number; n: number; total: number; by_sensor: Record<string, [number, number]> } | null;
  nearest_candidate_water: { date_id: string; distance_m: number | null; search_radius_m: number } | null;
  access: { status: AccessStatus; label: string; basis: Basis; source: string | null; time: string | null } | null;
  statements: Statement[];
  disclaimers: string[];
}

export interface GridFile {
  fixture: boolean;
  bounds: [number, number, number, number];
  width: number;
  height: number;
  dates: Record<string, string>;
}

interface Feature {
  properties: Record<string, string>;
  geometry: { type: string; coordinates: number[] | number[][] };
}

export const DISCLAIMERS = [
  "Candidate water-change indicator — not a validated flood map.",
  "Not for evacuation or route decisions.",
  "Based on past and latest radar observations — not a forecast.",
];

const NO_VALID = 0, LAND = 1, WATER = 2;
export const WATER_SEARCH_RADIUS_M = 2000;
const ACCESS_RADIUS_M = 3000;
const ROAD_SAMPLE_M = 50;
const M_LAT = 110574;
const M_LON_EQ = 111320;

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const rad = (d: number) => (d * Math.PI) / 180;
function dist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const kx = M_LON_EQ * Math.cos(rad((lat1 + lat2) / 2));
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * M_LAT);
}

export class ExposureModel {
  private states: Record<string, Uint8Array> = {};
  private grid: GridFile;
  private timeline: Timeline;
  private access: { features: Feature[] } | null;
  constructor(grid: GridFile, timeline: Timeline, access: { features: Feature[] } | null) {
    this.grid = grid;
    this.timeline = timeline;
    this.access = access;
    for (const [d, s] of Object.entries(grid.dates)) this.states[d] = decode(s);
  }

  private cell(lat: number, lon: number): [number, number] | null {
    const [w, s, e, n] = this.grid.bounds;
    if (!(w <= lon && lon < e && s < lat && lat <= n)) return null;
    const col = Math.floor(((lon - w) / (e - w)) * this.grid.width);
    const row = Math.floor(((n - lat) / (n - s)) * this.grid.height);
    return [Math.min(row, this.grid.height - 1), Math.min(col, this.grid.width - 1)];
  }

  private at(dateId: string, r: number, c: number) {
    return this.states[dateId][r * this.grid.width + c];
  }

  private nearestWater(dateId: string, lat: number, lon: number, radius: number): number | null {
    const { width: W, height: H } = this.grid;
    const [w, s, e, n] = this.grid.bounds;
    const dx = (e - w) / W, dy = (n - s) / H;
    const kx = M_LON_EQ * Math.cos(rad(lat));
    const rc = Math.ceil(radius / (dx * kx)) + 1;
    const rr = Math.ceil(radius / (dy * M_LAT)) + 1;
    const [row, col] = this.cell(lat, lon)!;
    if (this.at(dateId, row, col) === WATER) return 0;
    let best = Infinity;
    for (let r = Math.max(0, row - rr); r < Math.min(H, row + rr + 1); r++) {
      for (let c = Math.max(0, col - rc); c < Math.min(W, col + rc + 1); c++) {
        if (this.at(dateId, r, c) !== WATER) continue;
        const clat = n - (r + 0.5) * dy, clon = w + (c + 0.5) * dx;
        best = Math.min(best, Math.hypot((clon - lon) * kx, (clat - lat) * M_LAT));
      }
    }
    return best <= radius ? Math.round(best * 10) / 10 : null;
  }

  private accessStatus(latestId: string, latestTime: string, lat: number, lon: number): NonNullable<Exposure["access"]> {
    const feats = this.access?.features ?? [];
    const near = feats.filter((f) => {
      if (f.properties.kind !== "interruption" || f.geometry.type !== "Point") return false;
      const [plon, plat] = f.geometry.coordinates as number[];
      return dist(lat, lon, plat, plon) <= ACCESS_RADIUS_M;
    });
    if (near.length) {
      const p = near.reduce((a, b) => (a.properties.time >= b.properties.time ? a : b)).properties;
      return { status: "interruption_confirmed", label: `Interruption confirmed by ${p.source} at ${p.time}`, basis: "external", source: p.source, time: p.time };
    }
    for (const f of feats) {
      if (!["road", "bridge"].includes(f.properties.kind) || f.geometry.type !== "LineString") continue;
      const cs = f.geometry.coordinates as number[][];
      for (let i = 0; i + 1 < cs.length; i++) {
        const [lon1, lat1] = cs[i], [lon2, lat2] = cs[i + 1];
        const k = Math.max(1, Math.floor(dist(lat1, lon1, lat2, lon2) / ROAD_SAMPLE_M));
        for (let j = 0; j <= k; j++) {
          const t = j / k, plat = lat1 + (lat2 - lat1) * t, plon = lon1 + (lon2 - lon1) * t;
          if (dist(lat, lon, plat, plon) > ACCESS_RADIUS_M) continue;
          const c = this.cell(plat, plon);
          if (c && this.at(latestId, c[0], c[1]) === WATER) {
            return {
              status: "section_requiring_verification", label: "Section requiring verification", basis: "inference",
              source: `Radar candidate water (${latestId}) over ${f.properties.source ?? "road data"}`, time: latestTime,
            };
          }
        }
      }
    }
    return { status: "isolation_not_demonstrated", label: "Isolation not demonstrated", basis: "inference", source: null, time: null };
  }

  compute(lat: number, lon: number): Exposure {
    const fixture = this.grid.fixture || this.timeline.fixture;
    const base = { fixture, lat, lon, disclaimers: DISCLAIMERS };
    const cell = this.cell(lat, lon);
    if (!cell) {
      return { ...base, inside_aoi: false, latest: null, history: null, nearest_candidate_water: null, access: null,
        statements: [{ text: "This location is outside the study area.", basis: "inference", source: "AOI", time: null }] };
    }
    const entries = this.timeline.entries;
    const bySensor: Record<string, [number, number]> = {};
    let k = 0, n = 0;
    for (const e of entries) {
      const v = this.at(e.date_id, cell[0], cell[1]);
      const ks = (bySensor[e.sensor] ??= [0, 0]);
      if (v !== NO_VALID) {
        n++; ks[1]++;
        if (v === WATER) { k++; ks[0]++; }
      }
    }
    const last = entries[entries.length - 1];
    const v = this.at(last.date_id, cell[0], cell[1]);
    const state: ObservedState = v === WATER ? "candidate_water" : v === LAND ? "no_candidate_water" : "no_valid_observation";
    const d = this.nearestWater(last.date_id, lat, lon, WATER_SEARCH_RADIUS_M);
    const access = this.accessStatus(last.date_id, last.acquisition_time, lat, lon);
    const src = `${last.sensor} ${last.product}`;
    const stateText = {
      candidate_water: "Candidate water at this location in the latest observation.",
      no_candidate_water: "No candidate water at this location in the latest observation.",
      no_valid_observation: "No valid radar observation at this location in the latest acquisition.",
    }[state];
    return {
      ...base, inside_aoi: true,
      latest: { date_id: last.date_id, sensor: last.sensor, acquisition_time: last.acquisition_time, state },
      history: { k, n, total: entries.length, by_sensor: bySensor },
      nearest_candidate_water: { date_id: last.date_id, distance_m: d, search_radius_m: WATER_SEARCH_RADIUS_M },
      access,
      statements: [
        { text: stateText, basis: "radar", source: src, time: last.acquisition_time },
        { text: `Water observed here in ${k} of ${n} valid acquisitions (${entries.length} total).`, basis: "radar", source: "All timeline acquisitions", time: last.acquisition_time },
        { text: d !== null ? `Nearest candidate water: ${d.toFixed(0)} m.` : `No candidate water within ${WATER_SEARCH_RADIUS_M} m.`, basis: "radar", source: src, time: last.acquisition_time },
        { text: access.label, basis: access.basis, source: access.source ?? "Access analysis", time: access.time },
      ],
    };
  }
}
