"""Shared pieces of the offline pipeline: grid format, palette, rendering,
statistics and manifest. Used by build_layers.py, build_stats.py and
make_dev_fixtures.py so real data and fixtures go through the same code.

Grid format (grid.json):
    bounds   [west, south, east, north], WGS84 degrees, cell edges
    width, height
    dates    {date_id: base64 of uint8 row-major array, row 0 = north}
    state values: 0 no valid observation, 1 no candidate water, 2 candidate water
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]

NO_VALID, LAND, WATER = 0, 1, 2

# Change classes (between a date and the previous date of the same sensor).
CH_NONE, CH_PERSISTENT, CH_EXPANSION, CH_RETRACTION, CH_NO_VALID = 0, 1, 2, 3, 4

# Colour-blind-safe: blues for water, orange for retraction, grey hatch for no data.
WATER_LEGEND = [
    {"value": WATER, "label": "Candidate water", "color": "#2b6cb0", "pattern": "solid"},
    {"value": NO_VALID, "label": "No valid observation", "color": "#8a8a8a", "pattern": "hatch"},
]
CHANGE_LEGEND = [
    {"value": CH_PERSISTENT, "label": "Persistent water", "color": "#1d3f73", "pattern": "solid"},
    {"value": CH_EXPANSION, "label": "Candidate expansion", "color": "#4ea3f0", "pattern": "solid"},
    {"value": CH_RETRACTION, "label": "Candidate retraction", "color": "#e6a03c", "pattern": "solid"},
    {"value": CH_NO_VALID, "label": "No valid observation", "color": "#8a8a8a", "pattern": "hatch"},
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_aoi_bbox(path: Path = REPO / "data" / "aoi.geojson") -> list[float]:
    gj = json.loads(path.read_text(encoding="utf-8"))
    coords = gj["features"][0]["geometry"]["coordinates"][0]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return [min(xs), min(ys), max(xs), max(ys)]


def encode_grid(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.uint8).tobytes()).decode("ascii")


def decode_grid(s: str, width: int, height: int) -> np.ndarray:
    return np.frombuffer(base64.b64decode(s), dtype=np.uint8).reshape(height, width)


def change_classes(prev: np.ndarray, cur: np.ndarray) -> np.ndarray:
    """Classify change using only the intersection of valid cells."""
    out = np.full(cur.shape, CH_NONE, dtype=np.uint8)
    valid = (prev != NO_VALID) & (cur != NO_VALID)
    out[~valid] = CH_NO_VALID
    out[valid & (prev == WATER) & (cur == WATER)] = CH_PERSISTENT
    out[valid & (prev == LAND) & (cur == WATER)] = CH_EXPANSION
    out[valid & (prev == WATER) & (cur == LAND)] = CH_RETRACTION
    return out


def cell_area_km2(bounds: list[float], width: int, height: int) -> float:
    w, s, e, n = bounds
    lat0 = math.radians((s + n) / 2)
    dx = (e - w) / width * 111.320 * math.cos(lat0)
    dy = (n - s) / height * 110.574
    return dx * dy


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def render_png(classes: np.ndarray, legend: list[dict], path: Path, scale: int = 3,
               meta: dict[str, str] | None = None) -> None:
    """Render a class grid to an RGBA PNG; unlisted values are transparent.
    `meta` is stored as PNG text chunks (provenance travels with downloads)."""
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    big = np.kron(classes, np.ones((scale, scale), dtype=np.uint8))
    h, w = big.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rr, cc = np.mgrid[0:h, 0:w]
    stripes = ((rr + cc) % 8) < 2
    for item in legend:
        m = big == item["value"]
        if item["pattern"] == "hatch":
            m = m & stripes
            alpha = 200
        else:
            alpha = 215
        rgba[m, :3] = _hex(item["color"])
        rgba[m, 3] = alpha
    info = PngInfo()
    for k, v in (meta or {}).items():
        info.add_text(k, v)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path, optimize=True, pnginfo=info)


def locality_mask(bounds, width, height, lat, lon, radius_km) -> np.ndarray:
    """Provisional locality footprint: a circle around the locality point.
    To be replaced by official boundaries once the team picks a source."""
    w, s, e, n = bounds
    xs = w + (np.arange(width) + 0.5) * (e - w) / width
    ys = n - (np.arange(height) + 0.5) * (n - s) / height
    gx, gy = np.meshgrid(xs, ys)
    kx = 111.320 * math.cos(math.radians(lat))
    d = np.hypot((gx - lon) * kx, (gy - lat) * 110.574)
    return d <= radius_km


def build_stats(grid: dict, timeline: dict, localities: list[dict], fixture: bool,
                locality_radius_km: float = 2.0) -> dict:
    w, h, b = grid["width"], grid["height"], grid["bounds"]
    area = cell_area_km2(b, w, h)
    states = {d: decode_grid(s, w, h) for d, s in grid["dates"].items()}
    per_date = []
    for e in timeline["entries"]:
        cur = states[e["date_id"]]
        row = {
            "date_id": e["date_id"],
            "sensor": e["sensor"],
            "candidate_water_km2": round(float((cur == WATER).sum() * area), 3),
            "valid_km2": round(float((cur != NO_VALID).sum() * area), 3),
            "expansion_km2": None, "retraction_km2": None, "persistent_km2": None,
        }
        ref = e.get("reference_date_id")
        if ref:
            ch = change_classes(states[ref], cur)
            row["expansion_km2"] = round(float((ch == CH_EXPANSION).sum() * area), 3)
            row["retraction_km2"] = round(float((ch == CH_RETRACTION).sum() * area), 3)
            row["persistent_km2"] = round(float((ch == CH_PERSISTENT).sum() * area), 3)
        per_date.append(row)
    per_loc = []
    for loc in localities:
        m = locality_mask(b, w, h, loc["lat"], loc["lon"], locality_radius_km)
        if not m.any():
            continue
        rows = []
        for e in timeline["entries"]:
            cur = states[e["date_id"]]
            rows.append({
                "date_id": e["date_id"],
                "candidate_water_km2": round(float(((cur == WATER) & m).sum() * area), 3),
                "valid_fraction": round(float(((cur != NO_VALID) & m).sum() / m.sum()), 3),
            })
        per_loc.append({"locality_id": loc["locality_id"], "name": loc["name"], "per_date": rows})
    return {"fixture": fixture, "cell_area_km2": round(area, 6), "per_date": per_date,
            "per_locality": per_loc}


def build_layer_files(out: Path, grid: dict, timeline: dict, fixture: bool,
                      thresholds_db: dict[str, float | None]) -> None:
    """Write layers/<date_id>.json and the PNG overlays for every timeline entry."""
    w, h = grid["width"], grid["height"]
    states = {d: decode_grid(s, w, h) for d, s in grid["dates"].items()}
    for e in timeline["entries"]:
        d = e["date_id"]
        meta = {
            "Title": f"Candidate water — {e['sensor']} {e['acquisition_time']}",
            "Source": f"{e['sensor']} {e['product']} granule {e['granule_id']}",
            "Bounds": json.dumps(grid["bounds"]),
            "Disclaimer": "Candidate water-change indicator - not a validated flood map. "
                          "Not for evacuation or route decisions.",
            "Fixture": "DEV FIXTURE - not a result" if fixture else "no",
        }
        render_png(states[d], WATER_LEGEND, out / "layers" / f"{d}_water.png", meta=meta)
        layers = [{"kind": "water", "url": f"layers/{d}_water.png", "legend": WATER_LEGEND}]
        if e.get("reference_date_id"):
            ch = change_classes(states[e["reference_date_id"]], states[d])
            meta = {**meta, "Title": f"Candidate change {e['reference_date_id']} -> {d}"}
            render_png(ch, CHANGE_LEGEND, out / "layers" / f"{d}_change.png", meta=meta)
            layers.append({"kind": "change", "url": f"layers/{d}_change.png", "legend": CHANGE_LEGEND})
        write_json(out / "layers" / f"{d}.json", {
            "fixture": fixture, "date_id": d, "sensor": e["sensor"],
            "acquisition_time": e["acquisition_time"], "bounds": grid["bounds"],
            "threshold_db": thresholds_db.get(d), "layers": layers,
        })


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding="utf-8")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(out: Path, fixture: bool, parameters: dict, products: list[dict]) -> None:
    files = {
        p.relative_to(out).as_posix(): sha256(p)
        for p in sorted(out.rglob("*"))
        if p.is_file() and p.name != "manifest.json"
    }
    write_json(out / "manifest.json", {
        "fixture": fixture,
        "generated_at": now_iso(),
        "parameters": parameters,
        "products": products,
        "files": files,
    })
