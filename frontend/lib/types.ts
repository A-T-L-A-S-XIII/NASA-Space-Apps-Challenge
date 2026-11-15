// Mirrors backend/app/schemas.py.

export type Sensor = "NISAR" | "Sentinel-1";
export type BBox = [number, number, number, number]; // west, south, east, north

export interface TimelineEntry {
  date_id: string;
  acquisition_time: string;
  sensor: Sensor;
  product: string;
  granule_id: string;
  valid_fraction: number;
  reference_date_id: string | null;
}

export interface Timeline {
  fixture: boolean;
  generated_at: string;
  aoi_bbox: BBox;
  entries: TimelineEntry[];
}

export interface LegendItem {
  value: number;
  label: string;
  color: string;
  pattern: "solid" | "hatch";
}

export interface Layer {
  kind: "water" | "change";
  url: string;
  legend: LegendItem[];
}

export interface LayerSet {
  fixture: boolean;
  date_id: string;
  sensor: Sensor;
  acquisition_time: string;
  bounds: BBox;
  threshold_db: number | null;
  layers: Layer[];
}

export interface DateStats {
  date_id: string;
  sensor: Sensor;
  candidate_water_km2: number;
  expansion_km2: number | null;
  retraction_km2: number | null;
  persistent_km2: number | null;
  valid_km2: number;
}

export interface Stats {
  fixture: boolean;
  cell_area_km2: number;
  per_date: DateStats[];
  per_locality: {
    locality_id: string;
    name: string;
    per_date: { date_id: string; candidate_water_km2: number; valid_fraction: number }[];
  }[];
}

export interface Locality {
  locality_id: string;
  name: string;
  lat: number;
  lon: number;
  source: string;
}

export interface Localities {
  fixture: boolean;
  items: Locality[];
}
