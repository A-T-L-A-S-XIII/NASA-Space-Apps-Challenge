"""Download builders. Every file carries its provenance."""

from __future__ import annotations

import csv
import io

from ..schemas import DISCLAIMERS
from .store import Dataset


def provenance(ds: Dataset) -> dict:
    return {
        "fixture": ds.fixture,
        "warning": "DEV FIXTURE — synthetic, not a result" if ds.fixture else None,
        "generated_at": ds.manifest.get("generated_at"),
        "products": ds.manifest.get("products", []),
        "parameters": ds.manifest.get("parameters", {}),
        "acquisitions": [
            {k: e[k] for k in ("date_id", "sensor", "acquisition_time", "product", "granule_id")}
            for e in ds.timeline["entries"]
        ],
        "disclaimers": DISCLAIMERS,
    }


def stats_geojson(ds: Dataset) -> dict:
    locs = {l["locality_id"]: l for l in ds.localities["items"]}
    feats = []
    for s in ds.stats["per_locality"]:
        l = locs[s["locality_id"]]
        props = {"locality_id": l["locality_id"], "name": l["name"], "coordinate_source": l["source"]}
        for r in s["per_date"]:
            props[f"water_km2_{r['date_id']}"] = r["candidate_water_km2"]
            props[f"valid_fraction_{r['date_id']}"] = r["valid_fraction"]
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "Point", "coordinates": [l["lon"], l["lat"]]}})
    return {"type": "FeatureCollection", "provenance": provenance(ds), "features": feats}


def stats_csv(ds: Dataset) -> str:
    sensors = {e["date_id"]: e for e in ds.timeline["entries"]}
    buf = io.StringIO()
    p = provenance(ds)
    if p["warning"]:
        buf.write(f"# {p['warning']}\n")
    for d in DISCLAIMERS:
        buf.write(f"# {d}\n")
    buf.write(f"# generated_at: {p['generated_at']}\n")
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["locality_id", "name", "date_id", "sensor", "acquisition_time", "granule_id",
                "candidate_water_km2", "valid_fraction"])
    for s in ds.stats["per_locality"]:
        for r in s["per_date"]:
            e = sensors[r["date_id"]]
            w.writerow([s["locality_id"], s["name"], r["date_id"], e["sensor"],
                        e["acquisition_time"], e["granule_id"], r["candidate_water_km2"],
                        r["valid_fraction"]])
    return buf.getvalue()
