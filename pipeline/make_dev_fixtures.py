"""Write DEV FIXTURE data to data/fixtures/ so the API and the map can be built
before real data arrives.

Everything written here is synthetic and marked `"fixture": true`. It is not a
NISAR or Sentinel-1 result. validate_demo.py and the static export refuse it.

    python pipeline/make_dev_fixtures.py
"""

from __future__ import annotations

import shutil

import numpy as np

from common import (LAND, NO_VALID, REPO, WATER, build_layer_files, build_stats, decode_grid,
                    encode_grid,
                    load_aoi_bbox, now_iso, write_json, write_manifest)

OUT = REPO / "data" / "fixtures"
W = H = 200


def centre_col(row: float) -> float:
    """Column of the synthetic channel centre at a given row."""
    return W * 0.55 + 18 * np.sin(row / 17.0)


# Synthetic test towns (D-14): placed in grid cells, never real places. Each one
# exercises one access rule on the latest fixture date.
#   A: one of two exits crosses the channel   -> Section requiring verification
#   B: both exits cross the channel           -> No path under modeled conditions
#   C: far from the channel                   -> Isolation not demonstrated
#   D: exit covered by a fixture bulletin     -> Interruption confirmed by ...
TOWNS = {  # id: (name, row, col, [(road_id, end_row, end_col), ...])
    "test-town-a": ("Test Town A", 120, centre_col(120) - 8,
                    [("test-road-a-east", 120, centre_col(120) + 15),
                     ("test-road-a-west", 120, centre_col(120) - 30)]),
    "test-town-b": ("Test Town B", 150, centre_col(150) - 8,
                    [("test-road-b-east", 150, centre_col(150) + 15),
                     ("test-road-b-northeast", 138, centre_col(138) + 15)]),
    "test-town-c": ("Test Town C", 100, 20,
                    [("test-road-c-east", 100, 45), ("test-road-c-west", 100, 1)]),
    "test-town-d": ("Test Town D", 60, centre_col(60) - 8,
                    [("test-road-d-east", 60, centre_col(60) + 15)]),
}
BULLETINS = [{"source": "DEV FIXTURE bulletin", "time": "2025-04-19T12:00:00-03:00",
              "timezone": "America/Sao_Paulo", "segment_id": "test-road-d-east"}]


def lonlat(bounds: list[float], row: float, col: float) -> list[float]:
    w, s, e, n = bounds
    return [round(w + (col + 0.5) * (e - w) / W, 6), round(n - (row + 0.5) * (n - s) / H, 6)]

DATES = [  # (date_id, time, sensor, flood level 0..1)
    ("fixture-nisar-a", "2025-04-01T09:00:00Z", "NISAR", 0.0),
    ("fixture-s1-a", "2025-04-07T09:00:00Z", "Sentinel-1", 0.6),
    ("fixture-nisar-b", "2025-04-13T09:00:00Z", "NISAR", 1.0),
    ("fixture-s1-b", "2025-04-19T09:00:00Z", "Sentinel-1", 0.3),
]


def synthetic_state(level: float, seed: int) -> np.ndarray:
    """A made-up sinuous channel that widens with `level`. Not real hydrography."""
    rng = np.random.default_rng(seed)
    rows, cols = np.mgrid[0:H, 0:W]
    centre = centre_col(rows)
    half_width = 2.5 + 9.0 * level
    state = np.where(np.abs(cols - centre) <= half_width, WATER, LAND).astype(np.uint8)
    state[(rng.random((H, W)) < 0.002)] = WATER  # speckle-like false positives
    state[0:12, :] = NO_VALID  # a band without valid observation
    state[rows + cols < 25 + seed * 3] = NO_VALID
    return state


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    bounds = load_aoi_bbox()
    grid = {"fixture": True, "bounds": bounds, "width": W, "height": H, "dates": {}}
    entries, last_by_sensor = [], {}
    for i, (d, t, sensor, level) in enumerate(DATES):
        grid["dates"][d] = encode_grid(synthetic_state(level, i))
        entries.append({
            "date_id": d, "acquisition_time": t, "sensor": sensor,
            "product": "DEV FIXTURE (synthetic)", "granule_id": f"DEV-FIXTURE-{d}",
            "valid_fraction": 0.0, "reference_date_id": last_by_sensor.get(sensor),
        })
        last_by_sensor[sensor] = d
    for e in entries:
        s =decode_grid(grid["dates"][e["date_id"]], W, H)
        e["valid_fraction"] = round(float((s != NO_VALID).mean()), 3)

    timeline = {"fixture": True, "generated_at": now_iso(), "aoi_bbox": bounds, "entries": entries}
    localities, roads = [], []
    for tid, (name, row, col, town_roads) in TOWNS.items():
        lon, lat = lonlat(bounds, row, col)
        localities.append({"locality_id": tid, "name": name, "lat": lat, "lon": lon,
                           "source": "DEV FIXTURE — synthetic"})
        for rid, er, ec in town_roads:
            roads.append({"type": "Feature",
                          "properties": {"id": rid, "kind": "road", "name": f"DEV FIXTURE {rid}",
                                         "source": "DEV FIXTURE"},
                          "geometry": {"type": "LineString",
                                       "coordinates": [[lon, lat], lonlat(bounds, er, ec)]}})

    write_json(OUT / "grid.json", grid)
    write_json(OUT / "timeline.json", timeline)
    write_json(OUT / "localities.json", {"fixture": True, "items": localities})
    write_json(OUT / "stats.json", build_stats(grid, timeline, localities, fixture=True))
    build_layer_files(OUT, grid, timeline, fixture=True, thresholds_db={})
    write_json(OUT / "access.geojson", {"type": "FeatureCollection", "fixture": True,
                                        "features": roads})
    write_json(OUT / "bulletins.json", BULLETINS)
    write_manifest(OUT, fixture=True, parameters={"note": "DEV FIXTURE — synthetic"}, products=[])
    print(f"DEV FIXTURE data written to {OUT}")


if __name__ == "__main__":
    main()
