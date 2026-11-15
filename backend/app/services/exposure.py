"""'Is my area affected?' — answers from what the radar observed, never a forecast.

The same steps are repeated in frontend/lib/exposure.ts, so the static demo
works without a server. If you change one, change the other.
"""

from __future__ import annotations

import math
from datetime import datetime

import numpy as np

from ..schemas import (Access, AccessStatus, Basis, Exposure, History, LatestObservation,
                       NearestWater, ObservedState, Statement)
from .store import Dataset

NO_VALID, LAND, WATER = 0, 1, 2
WATER_SEARCH_RADIUS_M = 2000.0
ACCESS_RADIUS_M = 3000.0
ROAD_SAMPLE_M = 50.0
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON_EQ = 111_320.0


def _cell(ds: Dataset, lat: float, lon: float) -> tuple[int, int] | None:
    w, s, e, n = ds.bounds
    if not (w <= lon < e and s < lat <= n):
        return None
    col = int((lon - w) / (e - w) * ds.width)
    row = int((n - lat) / (n - s) * ds.height)
    return min(row, ds.height - 1), min(col, ds.width - 1)


def _dist_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    kx = M_PER_DEG_LON_EQ * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * M_PER_DEG_LAT)


def _nearest_water(ds: Dataset, state: np.ndarray, lat: float, lon: float, radius_m: float):
    w, s, e, n = ds.bounds
    dx = (e - w) / ds.width
    dy = (n - s) / ds.height
    kx = M_PER_DEG_LON_EQ * math.cos(math.radians(lat))
    rc = int(math.ceil(radius_m / (dx * kx))) + 1
    rr = int(math.ceil(radius_m / (dy * M_PER_DEG_LAT))) + 1
    row, col = _cell(ds, lat, lon)
    r0, r1 = max(0, row - rr), min(ds.height, row + rr + 1)
    c0, c1 = max(0, col - rc), min(ds.width, col + rc + 1)
    win = state[r0:r1, c0:c1]
    if state[row, col] == WATER:
        return 0.0
    rows, cols = np.nonzero(win == WATER)
    if rows.size == 0:
        return None
    clat = n - (rows + r0 + 0.5) * dy
    clon = w + (cols + c0 + 0.5) * dx
    d = np.hypot((clon - lon) * kx, (clat - lat) * M_PER_DEG_LAT)
    best = float(d.min())
    return round(best, 1) if best <= radius_m else None


def _densify(coords: list[list[float]], step_m: float):
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        k = max(1, int(_dist_m(lat1, lon1, lat2, lon2) / step_m))
        for i in range(k + 1):
            t = i / k
            yield lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t


def _access(ds: Dataset, latest_id: str, latest_time: datetime, lat: float, lon: float) -> Access:
    feats = (ds.access or {}).get("features", [])
    interruptions = [
        f for f in feats
        if f["properties"].get("kind") == "interruption" and f["geometry"]["type"] == "Point"
        and _dist_m(lat, lon, f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0])
        <= ACCESS_RADIUS_M
    ]
    if interruptions:
        f = max(interruptions, key=lambda f: f["properties"]["time"])
        p = f["properties"]
        return Access(status=AccessStatus.interruption_confirmed,
                      label=f"Interruption confirmed by {p['source']} at {p['time']}",
                      basis=Basis.external, source=p["source"], time=p["time"])
    state = ds.states[latest_id]
    for f in feats:
        if f["properties"].get("kind") not in ("road", "bridge"):
            continue
        if f["geometry"]["type"] != "LineString":
            continue
        for plat, plon in _densify(f["geometry"]["coordinates"], ROAD_SAMPLE_M):
            if _dist_m(lat, lon, plat, plon) > ACCESS_RADIUS_M:
                continue
            c = _cell(ds, plat, plon)
            if c and state[c] == WATER:
                return Access(status=AccessStatus.section_requiring_verification,
                              label="Section requiring verification",
                              basis=Basis.inference,
                              source=f"Radar candidate water ({latest_id}) over "
                                     f"{f['properties'].get('source', 'road data')}",
                              time=latest_time)
    return Access(status=AccessStatus.isolation_not_demonstrated,
                  label="Isolation not demonstrated", basis=Basis.inference)


def compute_exposure(ds: Dataset, lat: float, lon: float) -> Exposure:
    cell = _cell(ds, lat, lon)
    if cell is None:
        return Exposure(fixture=ds.fixture, lat=lat, lon=lon, inside_aoi=False,
                        statements=[Statement(text="This location is outside the study area.",
                                              basis=Basis.inference, source="AOI", time=None)])
    entries = ds.timeline["entries"]
    by_sensor: dict[str, list[int]] = {}
    k = n = 0
    for e in entries:
        v = int(ds.states[e["date_id"]][cell])
        ks = by_sensor.setdefault(e["sensor"], [0, 0])
        if v != NO_VALID:
            n += 1
            ks[1] += 1
            if v == WATER:
                k += 1
                ks[0] += 1
    last = entries[-1]
    last_time = datetime.fromisoformat(last["acquisition_time"].replace("Z", "+00:00"))
    v = int(ds.states[last["date_id"]][cell])
    state = {NO_VALID: ObservedState.no_valid_observation, LAND: ObservedState.no_candidate_water,
             WATER: ObservedState.candidate_water}[v]
    latest = LatestObservation(date_id=last["date_id"], sensor=last["sensor"],
                               acquisition_time=last_time, state=state)
    dist = _nearest_water(ds, ds.states[last["date_id"]], lat, lon, WATER_SEARCH_RADIUS_M)
    access = _access(ds, last["date_id"], last_time, lat, lon)

    src = f"{last['sensor']} {last['product']}"
    state_text = {
        ObservedState.candidate_water: "Candidate water at this location in the latest observation.",
        ObservedState.no_candidate_water: "No candidate water at this location in the latest observation.",
        ObservedState.no_valid_observation: "No valid radar observation at this location in the latest acquisition.",
    }[state]
    statements = [
        Statement(text=state_text, basis=Basis.radar, source=src, time=last_time),
        Statement(text=f"Water observed here in {k} of {n} valid acquisitions ({len(entries)} total).",
                  basis=Basis.radar, source="All timeline acquisitions", time=last_time),
        Statement(text=(f"Nearest candidate water: {dist:.0f} m." if dist is not None else
                        f"No candidate water within {WATER_SEARCH_RADIUS_M:.0f} m."),
                  basis=Basis.radar, source=src, time=last_time),
        Statement(text=access.label, basis=access.basis, source=access.source or "Access analysis",
                  time=access.time),
    ]
    return Exposure(
        fixture=ds.fixture, lat=lat, lon=lon, inside_aoi=True, latest=latest,
        history=History(k=k, n=n, total=len(entries),
                        by_sensor={s: (a, b) for s, (a, b) in by_sensor.items()}),
        nearest_candidate_water=NearestWater(date_id=last["date_id"], distance_m=dist,
                                             search_radius_m=WATER_SEARCH_RADIUS_M),
        access=access, statements=statements,
    )
