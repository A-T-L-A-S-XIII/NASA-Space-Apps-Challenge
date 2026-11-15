/**
 * Water Waltz API: types e client fetch para o Next.js.
 *
 * Espelha os modelos de backend/app/schemas.py (regiões, água, clima,
 * previsão, busca, passagens NISAR, municípios, explicações, status e autenticação). As rotas de radar processado
 * (/api/timeline, /api/layers...) já têm types em frontend/lib/types.ts.
 *
 * Uso:
 *   import { createApi } from "@/lib/frontend-api";
 *   const api = createApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000");
 *   const status = await api.regionStatus("vale-do-taquari");
 *
 * Dados com `source: "demo"` são ilustrativos: mostre sempre o selo e o `note`.
 */

// ------------------------------------------------------------------ comuns
export type StatusAgua = "seca" | "normal" | "alerta" | "enchente";
export type FaseEnso = "El Niño" | "La Niña" | "Neutro";
/** [lon_min, lat_min, lon_max, lat_max] */
export type BBox = [number, number, number, number];
/** "demo" para dado ilustrativo; "nisar" quando vier do NisarProvider. */
export type DataSource = "demo" | "nisar" | (string & {});
export type GeoJSONGeometry = { type: string; coordinates: unknown };

// ------------------------------------------------------------------ regiões
export interface City {
  /** Nome sem acento, com hífen (ex.: "roca-sales") */
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface River {
  name: string;
  /** Pontos [lon, lat], de norte a sul */
  coordinates: [number, number][];
}

export interface Region {
  id: string;
  name: string;
  state: string;
  bbox: BBox;
  /** [lat, lon] (formato do Leaflet) */
  center: [number, number];
  zoom: number;
  cities: City[];
  river: River;
}

export interface Scene {
  granule: string;
  start_time: string | null;
  product: string | null;
  flight_direction: string | null;
  data_maturity: string | null;
  url: string | null;
  browse: string | null;
  size_mb: number | null;
  geometry: GeoJSONGeometry | null;
}

export interface ScenesResponse {
  region_id: string;
  /** false quando o ASF não respondeu */
  live: boolean;
  count: number;
  query: Record<string, string | number>;
  /** Da mais recente para a mais antiga */
  scenes: Scene[];
  error: string | null;
  /** Data do snapshot usado quando a fonte ao vivo falhou (ou OFFLINE_MODE) */
  snapshot_date: string | null;
}

// --------------------------------------------------------------------- água
export interface TimelinePoint {
  /** AAAA-MM */
  date: string;
  water_area_km2: number;
  anomaly_pct: number;
  status: StatusAgua;
  oni: number | null;
  enso_phase: FaseEnso | null;
  event: string | null;
  source: DataSource;
}

export interface EnsoSource {
  live: boolean;
  source: string;
  error: string | null;
}

export interface RegionTimeline {
  region_id: string;
  source: DataSource;
  note: string | null;
  start: string;
  end: string;
  baseline_km2: number;
  enso: EnsoSource;
  series: TimelinePoint[];
}

export interface WaterMaskProperties {
  date: string;
  water_area_km2: number;
  anomaly_pct: number;
  status: StatusAgua;
  event: string | null;
  source: DataSource;
  cidades_atingidas: string[];
  note: string | null;
}

export interface WaterMaskFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: WaterMaskProperties;
}

/** GeoJSON FeatureCollection: pode ir direto para o mapa (Leaflet/MapLibre). */
export interface WaterMaskCollection {
  type: "FeatureCollection";
  region_id: string;
  date: string;
  source: DataSource;
  note: string | null;
  features: WaterMaskFeature[];
}

export interface CompareSide {
  date: string;
  water_area_km2: number;
  status: StatusAgua;
  cidades_atingidas: string[];
  geojson: WaterMaskCollection;
  /** Imagem da cena NISAR mais perto do mês (até 30 dias); null se não houver */
  browse_url: string | null;
  browse_date: string | null;
}

export interface WaterFrame {
  date: string;
  status: StatusAgua;
  water_area_km2: number;
  source: DataSource;
  /** Geometria simplificada (tolerância de 30 m) */
  geojson: GeoJSONGeometry;
}

export interface WaterFrames {
  region_id: string;
  source: DataSource;
  note: string | null;
  start: string;
  end: string;
  count: number;
  frames: WaterFrame[];
}

export interface Compare {
  region_id: string;
  source: DataSource;
  note: string | null;
  before: CompareSide;
  after: CompareSide;
  delta_km2: number;
  delta_pct: number | null;
  /** Cidades atingidas no mês de depois */
  cidades_atingidas: string[];
  /** Frase para o cidadão leigo */
  summary: string;
}

// -------------------------------------------------------------------- clima
export interface OniPoint {
  /** Estação de 3 meses, ex.: "DJF" */
  season: string;
  year: number;
  /** Mês central da estação (AAAA-MM) */
  month: string;
  total: number;
  oni: number;
  phase: FaseEnso;
}

export interface Enso {
  live: boolean;
  source: string;
  url: string;
  fetched_at: string | null;
  latest: OniPoint | null;
  count: number;
  series: OniPoint[];
  error: string | null;
  /** Data do snapshot usado quando a fonte ao vivo falhou (ou OFFLINE_MODE) */
  snapshot_date: string | null;
}

// -------------------------------------------------------------- explicações
export type ExplainTopicId = "sar" | "agua-no-radar" | "nisar" | "el-nino" | "la-nina" | "como-ler-o-mapa";

export interface LegendEntry {
  label: string;
  color: string;
  pattern: "solid" | "hatch";
  meaning: string;
}

export interface ExplainTopic {
  id: ExplainTopicId;
  title: string;
  summary: string;
  /** Parágrafos separados por linha em branco: body.split("\n\n") */
  body: string;
  icon: string;
  /** Só no tópico "como-ler-o-mapa" */
  legend: LegendEntry[] | null;
}

// ---------------------------------------------------------- status (card)
export interface StatusWater {
  date: string;
  water_area_km2: number;
  anomaly_pct: number;
  status: StatusAgua;
  event: string | null;
  source: DataSource;
  note: string | null;
}

export interface StatusEnso {
  live: boolean;
  month: string | null;
  season: string | null;
  oni: number | null;
  phase: FaseEnso | null;
  error: string | null;
  /** Data do snapshot usado quando a fonte ao vivo falhou (ou OFFLINE_MODE) */
  snapshot_date: string | null;
}

export interface StatusScene {
  live: boolean;
  scene: Scene | null;
  error: string | null;
  /** Data do snapshot usado quando a fonte ao vivo falhou (ou OFFLINE_MODE) */
  snapshot_date: string | null;
}

export interface RegionStatus {
  region_id: string;
  region_name: string;
  water: StatusWater;
  enso: StatusEnso;
  latest_scene: StatusScene;
  /** Resumo curto para o card principal */
  text: string;
}

// -------------------------------------------------------------- autenticação
export type Role = "cidadao" | "governo";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  city: string | null;
  created_at: string;
}

export interface UserCreate {
  name: string;
  email: string;
  password: string;
  city?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

// ------------------------------------------------------------------- alertas
export type NivelAlerta = "atencao" | "alerta" | "emergencia";

export interface Alert {
  id: number;
  region_id: string;
  /** null = alerta para a região inteira */
  city_id: string | null;
  level: NivelAlerta;
  title: string;
  message: string;
  created_by: number;
  created_at: string;
  active: boolean;
  /** "demo" = alerta de exemplo criado no startup, não é aviso real */
  source: "governo" | "demo";
}

export interface AlertCreate {
  region_id: string;
  city_id?: string | null;
  level: NivelAlerta;
  title: string;
  message: string;
}

export interface CityStatus {
  city_id: string;
  city_name: string;
  region_id: string;
  date: string;
  /** A mancha d'água do mês cobre o núcleo urbano da cidade */
  inside_water: boolean;
  status: StatusAgua;
  water_area_km2: number;
  source: DataSource;
  note: string | null;
  text: string;
  alerts: Alert[];
}

// ----------------------------------------------------------------- previsão
export interface ForecastDay {
  /** AAAA-MM-DD */
  date: string;
  rain_mm: number | null;
  rain_probability_pct: number | null;
  tmin_c: number | null;
  tmax_c: number | null;
}

/** Previsão do tempo da Open-Meteo. Não é previsão de enchente: mostre sempre o `kind`. */
export interface Forecast {
  region_id: string;
  source: "open-meteo";
  /** false quando a Open-Meteo não respondeu (vem o último cache, se houver, e `error`) */
  live: boolean;
  kind: string;
  lat: number;
  lon: number;
  generated_at: string | null;
  total_rain_mm: number;
  summary: string;
  days: ForecastDay[];
  error: string | null;
}

// ------------------------------------------------------------------ lugares
export interface Place {
  name: string;
  /** "município", "bairro" ou o tipo do OpenStreetMap (ex.: "road") */
  kind: string;
  lat: number;
  lon: number;
  /** Dentro da área observada pelas passagens NISAR processadas */
  inside_coverage: boolean;
  source: "ibge" | "osm";
}

export interface Places {
  q: string;
  region_id: string;
  source: "ibge+osm";
  items: Place[];
  /** Preenchido quando a busca de bairros (Nominatim) falhou; os municípios continuam vindo */
  error: string | null;
}

// --------------------------------------------------------- passagens NISAR
export interface PassImages {
  /** URL relativa à raiz da API (ex.: /api/static/nisar/img_07_2026-07-23/miniatura.png); cobre `coverage` */
  radar: string | null;
  slide: string | null;
}

export interface NisarPass {
  n: number;
  /** AAAA-MM-DD */
  date: string;
  /** Só compare passagens da mesma trilha */
  track: string;
  polarization: string;
  passes_in_track: number | null;
  water_km2: number;
  /** Água fora do normal */
  flood_km2: number;
  /** Falta de água em relação ao normal */
  dry_km2: number;
  in_flood_window: boolean;
  granule: string;
  images: PassImages;
  geojson_url: string;
}

export interface Passes {
  region_id: string;
  source: "nisar";
  data_source: string | null;
  note: string;
  month: string | null;
  months: string[];
  /** Área processada [oeste, sul, leste, norte] */
  coverage: BBox;
  count: number;
  passes: NisarPass[];
}

export interface PassFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: { class: "cheia" | "seca"; date: string; track: string; n: number; area_km2: number };
}

export interface PassGeoJSON {
  type: "FeatureCollection";
  region_id: string;
  source: "nisar";
  date: string;
  note: string;
  features: PassFeature[];
}

// --------------------------------------------------------------- municípios
export interface AreaByDate {
  date: string;
  flood_km2: number;
  dry_km2: number;
}

export interface MunicipalityArea {
  /** Código IBGE */
  id: string;
  name: string;
  touches_coverage: boolean;
  flood_km2: number;
  dry_km2: number;
  per_date: AreaByDate[];
}

export interface MunicipalitiesArea {
  region_id: string;
  source: "nisar";
  mesh_source: "ibge";
  month: string;
  dates: string[];
  method: string;
  outside_municipalities: { flood_km2: number; dry_km2: number };
  municipalities: MunicipalityArea[];
}

export interface MunicipalityMesh {
  type: "FeatureCollection";
  region_id: string;
  source: "ibge";
  attribution: string | null;
  features: { type: "Feature"; geometry: GeoJSONGeometry; properties: { id: string; name: string } }[];
}

export type ExportFormat = "json" | "csv" | "geojson";

// --------------------------------------------------------------------- erros
/** Erro da API. `detail` vem em português, pronto para mostrar ao usuário. */
export class ApiError extends Error {
  status: number;
  detail: string;
  body: unknown;

  constructor(status: number, detail: string, body: unknown) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

// -------------------------------------------------------------------- client
type Query = Record<string, string | number | undefined | null>;

export function createApi(baseUrl = "http://localhost:8000", getToken?: () => string | null) {
  const base = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
    const { query, headers, ...rest } = init;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    const token = getToken?.();

    const res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `Erro ${res.status}`;
      throw new ApiError(res.status, detail, body);
    }
    return body as T;
  }

  const region = (id: string) => `/api/regions/${encodeURIComponent(id)}`;

  return {
    health: () => request<{ status: "ok" }>("/health"),

    // Regiões
    regions: () => request<Region[]>("/api/regions"),
    region: (id: string) => request<Region>(region(id)),
    regionStatus: (id: string) => request<RegionStatus>(`${region(id)}/status`),
    scenes: (id: string, opts: { start?: string; end?: string; product?: string; limit?: number } = {}) =>
      request<ScenesResponse>(`${region(id)}/scenes`, { query: opts }),

    // Água (hoje demo)
    timeline: (id: string, opts: { start?: string; end?: string } = {}) =>
      request<RegionTimeline>(`${region(id)}/timeline`, { query: opts }),
    waterMask: (id: string, date: string) =>
      request<WaterMaskCollection>(`${region(id)}/water-mask`, { query: { date } }),
    waterFrames: (id: string, opts: { start?: string; end?: string } = {}) =>
      request<WaterFrames>(`${region(id)}/water-mask/frames`, { query: opts }),
    compare: (id: string, before: string, after: string) =>
      request<Compare>(`${region(id)}/compare`, { query: { before, after } }),

    // Alertas
    alerts: (opts: { region_id?: string; city_id?: string } = {}) => request<Alert[]>("/api/alerts", { query: opts }),
    createAlert: (data: AlertCreate) =>
      request<Alert>("/api/alerts", { method: "POST", body: JSON.stringify(data) }),
    setAlertActive: (alertId: number, active: boolean) =>
      request<Alert>(`/api/alerts/${alertId}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    myCityStatus: () => request<CityStatus>("/api/me/city-status"),
    /** CSV da linha do tempo (só governo). Devolve um Blob para baixar. */
    exportTimelineCsv: async (id: string, opts: { start?: string; end?: string } = {}) => {
      const params = new URLSearchParams(Object.entries(opts).filter(([, v]) => v) as [string, string][]);
      const token = getToken?.();
      const res = await fetch(`${base}/api/gov/export/${encodeURIComponent(id)}.csv?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : `Erro ${res.status}`, body);
      }
      return res.blob();
    },

    // Clima
    enso: (start?: string) => request<Enso>("/api/climate/enso", { query: { start } }),
    forecast: (id: string, days?: number) => request<Forecast>(`${region(id)}/forecast`, { query: { days } }),

    // Busca
    places: (q: string, regionId = "vale-do-taquari") =>
      request<Places>("/api/places", { query: { q, region_id: regionId } }),

    // Passagens NISAR processadas
    passes: (id: string, month?: string) => request<Passes>(`${region(id)}/passes`, { query: { month } }),
    passGeoJSON: (id: string, n: number) => request<PassGeoJSON>(`${region(id)}/passes/${n}/geojson`),
    municipalities: (id: string, month: string) =>
      request<MunicipalitiesArea>(`${region(id)}/municipalities`, { query: { month } }),
    municipalityMesh: (id: string) => request<MunicipalityMesh>(`${region(id)}/municipalities/geojson`),
    /** URL absoluta de um caminho relativo da API (imagens das passagens, links de exportação). */
    url: (path: string) => `${base}${path}`,
    /** Link da exportação (arquivo com Content-Disposition; só dados públicos do radar). */
    exportUrl: (id: string, format: ExportFormat = "json", month?: string) =>
      `${base}${region(id)}/export?format=${format}${month ? `&month=${encodeURIComponent(month)}` : ""}`,

    // Explicações
    explain: () => request<ExplainTopic[]>("/api/explain"),
    explainTopic: (topic: ExplainTopicId) => request<ExplainTopic>(`/api/explain/${topic}`),

    // Autenticação
    register: (data: UserCreate) =>
      request<User>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (email: string, password: string) =>
      request<TokenResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request<User>("/api/auth/me"),
    createGovUser: (data: UserCreate) =>
      request<User>("/api/auth/gov-users", { method: "POST", body: JSON.stringify(data) }),
  };
}

export type WaterWaltzApi = ReturnType<typeof createApi>;
