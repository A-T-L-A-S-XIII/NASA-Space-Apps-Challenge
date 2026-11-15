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

# Approximate town-centre coordinates, for development only. Replace with an
# official source (e.g. IBGE) before the demo — see docs/DATA.md.
LOCALITIES = [
    ("lajeado", "Lajeado", -29.467, -51.961),
    ("estrela", "Estrela", -29.502, -51.950),
    ("arroio-do-meio", "Arroio do Meio", -29.401, -51.945),
    ("encantado", "Encantado", -29.236, -51.870),
    ("roca-sales", "Roca Sales", -29.284, -51.866),
    ("colinas", "Colinas", -29.394, -51.855),
    ("cruzeiro-do-sul", "Cruzeiro do Sul", -29.514, -51.986),
]

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
    centre = W * 0.55 + 18 * np.sin(rows / 17.0)
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
    localities = [{"locality_id": a, "name": n, "lat": la, "lon": lo,
                   "source": "DEV FIXTURE — approximate, to verify"} for a, n, la, lo in LOCALITIES]

    write_json(OUT / "grid.json", grid)
    write_json(OUT / "timeline.json", timeline)
    write_json(OUT / "localities.json", {"fixture": True, "items": localities})
    write_json(OUT / "stats.json", build_stats(grid, timeline, localities, fixture=True))
    build_layer_files(OUT, grid, timeline, fixture=True, thresholds_db={})
    write_json(OUT / "access.geojson", {
        "type": "FeatureCollection", "fixture": True,
        "features": [
            {"type": "Feature",
             "properties": {"id": "fixture-road-1", "kind": "road", "name": "DEV FIXTURE road",
                            "source": "DEV FIXTURE"},
             "geometry": {"type": "LineString",
                          "coordinates": [[-51.98, -29.40], [-51.93, -29.40], [-51.88, -29.41]]}},
            {"type": "Feature",
             "properties": {"id": "fixture-interruption-1", "kind": "interruption",
                            "segment_id": "fixture-road-1", "source": "DEV FIXTURE bulletin",
                            "time": "2025-04-13T12:00:00Z"},
             "geometry": {"type": "Point", "coordinates": [-51.93, -29.40]}},
        ],
    })
    write_manifest(OUT, fixture=True, parameters={"note": "DEV FIXTURE — synthetic"}, products=[])
    print(f"DEV FIXTURE data written to {OUT}")


if __name__ == "__main__":
    main()
