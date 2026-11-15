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
EXIT_RADIUS_M = 2000.0  # proposal (D-14); 3–5 km may suit larger towns
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


def _lines(geom: dict) -> list[list[list[float]]]:
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def road_exits(ds: Dataset, date_id: str, lat: float, lon: float,
               radius_m: float = EXIT_RADIUS_M) -> list[dict]:
    """Road segments that cross the circle around a point (the 'exits').

    An exit is *cut* if a part of it inside the circle lies on candidate water
    (cells with a valid observation only); *observed* if any part inside the
    circle has a valid observation.
    """
    state = ds.states[date_id]
    exits = []
    for f in (ds.access or {}).get("features", []):
        p = f["properties"]
        if p.get("kind") not in ("road", "bridge"):
            continue
        inside = outside = cut = observed = False
        for line in _lines(f["geometry"]):
            for plat, plon in _densify(line, ROAD_SAMPLE_M):
                if _dist_m(lat, lon, plat, plon) > radius_m:
                    outside = True
                    continue
                inside = True
                c = _cell(ds, plat, plon)
                v = int(state[c]) if c else NO_VALID
                if v != NO_VALID:
                    observed = True
                if v == WATER:
                    cut = True
        if inside and outside:
            exits.append({"id": p["id"], "name": p.get("name"), "cut": cut, "observed": observed})
    return exits


def flagged_road_ids(ds: Dataset, date_id: str) -> list[str]:
    """Road segments crossing candidate water on a date (valid cells only), for the map."""
    state = ds.states[date_id]
    out = []
    for f in (ds.access or {}).get("features", []):
        p = f["properties"]
        if p.get("kind") not in ("road", "bridge"):
            continue
        hit = False
        for line in _lines(f["geometry"]):
            for plat, plon in _densify(line, ROAD_SAMPLE_M):
                c = _cell(ds, plat, plon)
                if c and state[c] == WATER:
                    hit = True
                    break
            if hit:
                break
        if hit:
            out.append(p["id"])
    return out


def _access(ds: Dataset, latest_id: str, latest_time: datetime, lat: float, lon: float) -> Access:
    exits = road_exits(ds, latest_id, lat, lon)
    exit_ids = {e["id"] for e in exits}
    cut_ids = [e["id"] for e in exits if e["cut"]]
    common = {"exits": len(exits), "cut_exit_ids": cut_ids}

    # (a) an official bulletin covers one of the exits
    bulletins = [b for b in ds.bulletins if b.get("segment_id") in exit_ids]
    if bulletins:
        b = max(bulletins, key=lambda b: b["time"])
        return Access(status=AccessStatus.interruption_confirmed,
                      label=f"Interruption confirmed by {b['source']} at {b['time']}",
                      basis=Basis.external, source=b["source"], time=b["time"], **common)
    radar_src = f"NISAR candidate water ({latest_id}) over OpenStreetMap roads"
    # (b) all exits cut
    if exits and len(cut_ids) == len(exits):
        return Access(status=AccessStatus.no_path_under_modeled_conditions,
                      label="No path under modeled conditions", basis=Basis.inference,
                      source=radar_src, time=latest_time, **common)
    # (c) at least one exit cut
    if cut_ids:
        return Access(status=AccessStatus.section_requiring_verification,
                      label="Section requiring verification", basis=Basis.inference,
                      source=radar_src, time=latest_time, **common)
    # (d) nothing demonstrated; warn when the roads were not observed
    warning = None
    if not exits:
        warning = "No mapped road exits within the search radius."
    elif not any(e["observed"] for e in exits):
        warning = "No valid radar observation over the roads in the latest acquisition."
    return Access(status=AccessStatus.isolation_not_demonstrated,
                  label="Isolation not demonstrated", basis=Basis.inference,
                  coverage_warning=warning, **common)


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
    if access.coverage_warning:
        statements.append(Statement(text=access.coverage_warning, basis=Basis.inference,
                                    source="Access analysis", time=last_time))
    return Exposure(
        fixture=ds.fixture, lat=lat, lon=lon, inside_aoi=True, latest=latest,
        history=History(k=k, n=n, total=len(entries),
                        by_sensor={s: (a, b) for s, (a, b) in by_sensor.items()}),
        nearest_candidate_water=NearestWater(date_id=last["date_id"], distance_m=dist,
                                             search_radius_m=WATER_SEARCH_RADIUS_M),
        access=access, statements=statements,
    )
