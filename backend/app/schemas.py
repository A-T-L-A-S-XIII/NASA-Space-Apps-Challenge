"""Shapes of the JSON the API returns. frontend/lib/types.ts mirrors them.

Every response has `fixture`: true means test data, never a result.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Sensor = Literal["NISAR", "Sentinel-1"]
# [west, south, east, north] in WGS84 degrees.
BBox = tuple[float, float, float, float]

DISCLAIMERS = [
    "Candidate water-change indicator — not a validated flood map.",
    "Not for evacuation or route decisions.",
    "Based on past and latest radar observations — not a forecast.",
]


class Contracted(BaseModel):
    fixture: bool = Field(description="True for DEV FIXTURE data. Never a result.")


# ---------------------------------------------------------------- timeline
class TimelineEntry(BaseModel):
    date_id: str = Field(description="Stable id, e.g. 'nisar-20250312T0912'")
    acquisition_time: datetime = Field(description="Acquisition start, UTC")
    sensor: Sensor
    product: str = Field(description="Product type and version actually read, e.g. 'GCOV ...'")
    granule_id: str
    valid_fraction: float = Field(ge=0, le=1, description="Share of AOI cells with a valid observation")
    reference_date_id: str | None = Field(
        description="Previous date of the same sensor used for the change layer; null for the first"
    )


class Timeline(Contracted):
    generated_at: datetime
    aoi_bbox: BBox
    entries: list[TimelineEntry] = Field(description="Sorted by acquisition_time ascending")


# ------------------------------------------------------------------ layers
class LegendItem(BaseModel):
    value: int = Field(description="Class value in the grid")
    label: str
    color: str = Field(description="Hex colour; pattern 'hatch' means rendered with hatching")
    pattern: Literal["solid", "hatch"] = "solid"


class Layer(BaseModel):
    kind: Literal["water", "change"]
    url: str = Field(description="PNG overlay path relative to the API root")
    legend: list[LegendItem]


class LayerSet(Contracted):
    date_id: str
    sensor: Sensor
    acquisition_time: datetime
    bounds: BBox
    threshold_db: float | None = Field(description="Water threshold applied, in dB")
    layers: list[Layer]


# ---------------------------------------------------------------- exposure
class ObservedState(str, Enum):
    candidate_water = "candidate_water"
    no_candidate_water = "no_candidate_water"
    no_valid_observation = "no_valid_observation"


class AccessStatus(str, Enum):
    interruption_confirmed = "interruption_confirmed"
    section_requiring_verification = "section_requiring_verification"
    isolation_not_demonstrated = "isolation_not_demonstrated"


class Basis(str, Enum):
    radar = "radar"
    external = "external"
    inference = "inference"


class Statement(BaseModel):
    """One claim shown on the area card, always with its source and date."""

    text: str
    basis: Basis
    source: str
    time: datetime | None


class LatestObservation(BaseModel):
    date_id: str
    sensor: Sensor
    acquisition_time: datetime
    state: ObservedState


class History(BaseModel):
    k: int = Field(description="Acquisitions with candidate water at this cell")
    n: int = Field(description="Acquisitions with a valid observation at this cell")
    total: int = Field(description="All acquisitions in the timeline")
    by_sensor: dict[str, tuple[int, int]] = Field(description="sensor -> (k, n)")


class NearestWater(BaseModel):
    date_id: str
    distance_m: float | None = Field(description="Null when none found within the search radius")
    search_radius_m: float


class Access(BaseModel):
    status: AccessStatus
    label: str
    basis: Basis
    source: str | None = None
    time: datetime | None = None


class Exposure(Contracted):
    lat: float
    lon: float
    inside_aoi: bool
    latest: LatestObservation | None = None
    history: History | None = None
    nearest_candidate_water: NearestWater | None = None
    access: Access | None = None
    statements: list[Statement] = []
    disclaimers: list[str] = DISCLAIMERS


# ------------------------------------------------------------------- stats
class DateStats(BaseModel):
    date_id: str
    sensor: Sensor
    candidate_water_km2: float
    expansion_km2: float | None = Field(description="Null for the first date of a sensor")
    retraction_km2: float | None
    persistent_km2: float | None
    valid_km2: float


class LocalityDateStats(BaseModel):
    date_id: str
    candidate_water_km2: float
    valid_fraction: float


class LocalityStats(BaseModel):
    locality_id: str
    name: str
    per_date: list[LocalityDateStats]


class Stats(Contracted):
    cell_area_km2: float
    per_date: list[DateStats]
    per_locality: list[LocalityStats]


# --------------------------------------------------------------- localities
class Locality(BaseModel):
    locality_id: str
    name: str
    lat: float
    lon: float
    source: str = Field(description="Where the coordinates come from")


class Localities(Contracted):
    items: list[Locality]


# --------------------------------------------------------------------- auth
class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)  # bcrypt aceita até 72 bytes
    city: str | None = None
    # Campos extras (como "role") são ignorados: o cadastro público é sempre "cidadao"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: Literal["cidadao", "governo"]
    city: str | None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ------------------------------------------------------------------ sistema
class Health(BaseModel):
    status: Literal["ok"]


# ------------------------------------------------------------------ regiões
# Campos em português/inglês seguem o JSON que o frontend já consome.
StatusAgua = Literal["seca", "normal", "alerta", "enchente"]
FaseEnso = Literal["El Niño", "La Niña", "Neutro"]


class City(BaseModel):
    id: str = Field(description="Nome sem acento, com hífen (ex.: roca-sales)")
    name: str
    lat: float
    lon: float


class River(BaseModel):
    name: str
    coordinates: list[tuple[float, float]] = Field(description="Pontos [lon, lat], de norte a sul")


class Region(BaseModel):
    id: str
    name: str
    state: str
    bbox: BBox = Field(description="[lon_min, lat_min, lon_max, lat_max]")
    center: tuple[float, float] = Field(description="[lat, lon] (formato do Leaflet)")
    zoom: int
    cities: list[City]
    river: River


class Scene(BaseModel):
    granule: str
    start_time: str | None
    product: str | None
    flight_direction: str | None
    data_maturity: str | None
    url: str | None
    browse: str | None
    size_mb: float | None
    geometry: dict | None


class ScenesResponse(BaseModel):
    region_id: str
    live: bool = Field(description="False quando o ASF não respondeu")
    count: int
    query: dict
    scenes: list[Scene] = Field(description="Da cena mais recente para a mais antiga")
    error: str | None
    snapshot_date: str | None = Field(None, description="Data do snapshot usado quando a fonte ao vivo não respondeu (ou OFFLINE_MODE)")


# ------------------------------------------------------- água (linha do tempo)
class TimelinePoint(BaseModel):
    date: str = Field(description="AAAA-MM")
    water_area_km2: float
    anomaly_pct: float = Field(description="Diferença em % para a linha de base")
    status: StatusAgua
    oni: float | None = Field(description="ONI da NOAA para a estação centrada neste mês")
    enso_phase: FaseEnso | None
    event: str | None
    source: str = Field(description='"demo" para dado ilustrativo')


class EnsoSource(BaseModel):
    live: bool
    source: str
    error: str | None
    snapshot_date: str | None = Field(None, description="Data do snapshot usado quando a fonte ao vivo não respondeu (ou OFFLINE_MODE)")


class RegionTimeline(BaseModel):
    region_id: str
    source: str
    note: str | None
    start: str
    end: str
    baseline_km2: float
    enso: EnsoSource
    series: list[TimelinePoint]


class WaterMaskProperties(BaseModel):
    date: str
    water_area_km2: float
    anomaly_pct: float
    status: StatusAgua
    event: str | None
    source: str
    cidades_atingidas: list[str]
    note: str | None


class WaterMaskFeature(BaseModel):
    type: Literal["Feature"]
    geometry: dict = Field(description="Geometria GeoJSON (Polygon ou MultiPolygon) em lon/lat")
    properties: WaterMaskProperties


class WaterMaskCollection(BaseModel):
    type: Literal["FeatureCollection"]
    region_id: str
    date: str
    source: str
    note: str | None
    features: list[WaterMaskFeature]


class CompareSide(BaseModel):
    date: str
    water_area_km2: float
    status: StatusAgua
    cidades_atingidas: list[str]
    geojson: WaterMaskCollection
    browse_url: str | None = Field(description="Imagem (browse) da cena NISAR mais perto do mês, até 30 dias; "
                                               "null se não houver")
    browse_date: str | None = Field(description="Data e hora da cena do browse_url")


class WaterFrame(BaseModel):
    date: str = Field(description="AAAA-MM")
    status: StatusAgua
    water_area_km2: float
    source: str
    geojson: dict = Field(description="Geometria GeoJSON simplificada (tolerância de 30 m)")


class WaterFrames(BaseModel):
    region_id: str
    source: str
    note: str | None
    start: str
    end: str
    count: int
    frames: list[WaterFrame]


class Compare(BaseModel):
    region_id: str
    source: str
    note: str | None
    before: CompareSide
    after: CompareSide
    delta_km2: float
    delta_pct: float | None
    cidades_atingidas: list[str] = Field(description="Cidades atingidas no mês de depois")
    summary: str = Field(description="Frase para o cidadão leigo")


# -------------------------------------------------------------------- clima
class OniPoint(BaseModel):
    season: str = Field(description="Estação de 3 meses, ex.: DJF")
    year: int
    month: str = Field(description="Mês central da estação (AAAA-MM)")
    total: float
    oni: float
    phase: FaseEnso


class Enso(BaseModel):
    live: bool
    source: str
    url: str
    fetched_at: str | None
    latest: OniPoint | None
    count: int
    series: list[OniPoint]
    error: str | None
    snapshot_date: str | None = Field(None, description="Data do snapshot usado quando a fonte ao vivo não respondeu (ou OFFLINE_MODE)")


# --------------------------------------------------------------- explicações
class LegendEntry(BaseModel):
    label: str
    color: str = Field(description="Cor em hexadecimal")
    pattern: Literal["solid", "hatch"] = "solid"
    meaning: str


class ExplainTopic(BaseModel):
    id: str
    title: str
    summary: str
    body: str = Field(description="Texto em parágrafos separados por linha em branco")
    icon: str = Field(description="Nome genérico de ícone (ex.: radar, droplets)")
    legend: list[LegendEntry] | None = Field(None, description="Só no tópico como-ler-o-mapa")


# ---------------------------------------------------------- status da região
class StatusWater(BaseModel):
    date: str
    water_area_km2: float
    anomaly_pct: float
    status: StatusAgua
    event: str | None
    source: str
    note: str | None


class StatusEnso(BaseModel):
    live: bool
    month: str | None = Field(description="Mês central da última estação publicada pela NOAA")
    season: str | None
    oni: float | None
    phase: FaseEnso | None
    error: str | None
    snapshot_date: str | None = Field(None, description="Data do snapshot usado quando a fonte ao vivo não respondeu (ou OFFLINE_MODE)")


class StatusScene(BaseModel):
    live: bool
    scene: Scene | None = Field(description="Cena NISAR GCOV mais recente sobre a região")
    error: str | None
    snapshot_date: str | None = Field(None, description="Data do snapshot usado quando a fonte ao vivo não respondeu (ou OFFLINE_MODE)")


class RegionStatus(BaseModel):
    region_id: str
    region_name: str
    water: StatusWater
    enso: StatusEnso
    latest_scene: StatusScene
    text: str = Field(description="Resumo curto para o card principal")


# ----------------------------------------------------------- radar (arquivos)
class FeatureCollection(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["FeatureCollection"]
    features: list[dict]


# ------------------------------------------------------------------- alertas
NivelAlerta = Literal["atencao", "alerta", "emergencia"]


class AlertCreate(BaseModel):
    region_id: str
    city_id: str | None = Field(None, description="Vazio = alerta para a região inteira")
    level: NivelAlerta
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)


class AlertUpdate(BaseModel):
    active: bool = Field(description="false desativa o alerta")


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    region_id: str
    city_id: str | None
    level: NivelAlerta
    title: str
    message: str
    created_by: int
    created_at: datetime
    active: bool
    source: Literal["governo", "demo"] = Field(description='"demo" para alerta de exemplo criado no startup')


class CityStatus(BaseModel):
    city_id: str
    city_name: str
    region_id: str
    date: str = Field(description="Mês mais recente (AAAA-MM)")
    inside_water: bool = Field(description="A mancha d'água do mês cobre o núcleo urbano da cidade")
    status: StatusAgua = Field(description="Status do rio na região no mesmo mês")
    water_area_km2: float
    source: str = Field(description='"demo" para dado ilustrativo')
    note: str | None
    text: str = Field(description="Frase curta para o cidadão")
    alerts: list[AlertOut] = Field(description="Alertas ativos da cidade e da região inteira")


# ------------------------------------------------------------ NISAR processado
class NisarScene(BaseModel):
    date: str = Field(description="Data da passagem (AAAA-MM-DD)")
    acquisition_time: str
    granule: str
    track: str | None = Field(description="Trilha, ex.: 103_A_163. Só compare cenas da mesma trilha")
    flight_direction: str | None
    polarization: str
    method: Literal["fixed", "otsu"]
    threshold_db: float
    water_area_km2: float = Field(description="Área de água no recorte processado (UTM)")
    valid_fraction: float = Field(description="Fração do recorte com medição válida")
    scene_coverage: float = Field(description="Fração do bbox da região coberta pela cena")
    pixel_size_m: float
    bbox: BBox
    processed_at: str
    file: str


class NisarProcessed(BaseModel):
    region_id: str
    count: int
    scenes: list[NisarScene] = Field(description="Da mais recente para a mais antiga")


RecurrenceClassName = Literal["pontual", "voltou", "recorrente", "permanente"]


class RecurrenceClass(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    class_: RecurrenceClassName = Field(alias="class")
    description: str
    months_min: int | None = Field(description="Mínimo de meses alagados (vazio para permanente)")
    months_max: int | None = Field(description="Máximo de meses alagados (vazio = sem limite)")
    area_km2: float


class CityRecurrence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    city_id: str
    name: str
    class_: Literal["pontual", "voltou", "recorrente", "sem_registro"] = Field(
        alias="class", description="Classe mais forte que cobre pelo menos 10% do círculo de 1 km da cidade. "
                                   "sem_registro NÃO quer dizer que nunca alagou (o radar perde enchentes curtas "
                                   "e não vê água entre prédios)")
    flooded_share: float = Field(description="Fração do círculo de 1 km que alagou ao menos uma vez (fora do leito)")


class MonthlyFlood(BaseModel):
    month: str = Field(description="AAAA-MM")
    images: int = Field(description="Passagens do Sentinel-1 no mês")
    flooded_km2: float = Field(description="Área alagada fora do leito do rio no mês")


class Recurrence(BaseModel):
    region_id: str
    source: Literal["sentinel-1"]
    note: str
    period_start: str
    period_end: str
    images: int
    relative_orbit: int
    orbit_pass: str | None
    threshold_db: float
    classes: list[RecurrenceClass]
    cities: list[CityRecurrence]
    monthly: list[MonthlyFlood] = Field(description="Só os meses com passagem, do mais antigo ao mais recente")
    geojson: FeatureCollection | None = Field(description="Manchas por classe; vazio com geometry=false")
