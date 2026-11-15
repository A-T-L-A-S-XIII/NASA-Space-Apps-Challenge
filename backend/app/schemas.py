"""Data contract shared by the pipeline, the API and the frontend.

Every response carries `fixture`. A DEV FIXTURE is never a result: the demo
build (pipeline/validate_demo.py) and the static export refuse it.

The JSON Schemas in docs/contract/ are generated from these models with
`python backend/export_schemas.py`; do not edit them by hand.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

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
