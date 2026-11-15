"""Área de cheia e de seca por município, a partir das passagens NISAR processadas.

Cada polígono de cheia ou seca é somado ao município que contém o seu centróide
(malha municipal do IBGE, gerada por pipeline/build_vale_municipios.py). A área
processada cobre só parte de cada município, então o número não é o total do município.
"""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import box, shape
from shapely.prepared import prep

from app.config import settings
from app.services import passes as passes_service

MESH_SOURCE = "ibge"
METHOD = ("Cada polígono de cheia ou seca é somado ao município que contém o seu centro (malha municipal do IBGE). "
          "A área processada cobre só parte de cada município.")


@lru_cache(maxsize=4)
def _read(path: str, mtime: float) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_mesh() -> dict | None:
    path = Path(settings.municipalities_file)
    try:
        return _read(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return None


@lru_cache(maxsize=4)
def _shapes(path: str, mtime: float) -> list[tuple[dict, object, object]]:
    mesh = _read(path, mtime)
    out = []
    for f in mesh["features"]:
        geom = shape(f["geometry"])
        out.append((f["properties"], geom, prep(geom)))
    return out


def shapes() -> list[tuple[dict, object, object]]:
    """(propriedades, geometria, geometria preparada) de cada município."""
    path = Path(settings.municipalities_file)
    return _shapes(str(path), path.stat().st_mtime)


def mesh_geojson(region: dict, mesh: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "region_id": region["id"],
        "source": MESH_SOURCE,
        "attribution": mesh.get("source"),
        "features": mesh["features"],
    }


def by_municipality(region: dict, all_passes: list[dict], month: str) -> dict:
    chosen = passes_service.in_month(all_passes, month)
    cover = box(*passes_service.coverage(all_passes))
    munis = shapes()
    rows = {
        props["id"]: {"id": props["id"], "name": props["name"], "touches_coverage": geom.intersects(cover),
                      "flood_km2": 0.0, "dry_km2": 0.0,
                      "per_date": {p["data"]: {"flood_km2": 0.0, "dry_km2": 0.0} for p in chosen}}
        for props, geom, _ in munis
    }
    outside = {"flood_km2": 0.0, "dry_km2": 0.0}
    for p in chosen:
        for feat in passes_service.features(region, p):
            key = "flood_km2" if feat["properties"]["class"] == "cheia" else "dry_km2"
            area = feat["properties"]["area_km2"]
            center = shape(feat["geometry"]).centroid
            hit = next((props for props, _, prepared in munis if prepared.contains(center)), None)
            if hit is None:
                outside[key] += area
                continue
            row = rows[hit["id"]]
            row[key] += area
            row["per_date"][p["data"]][key] += area

    def rounded(d: dict) -> dict:
        return {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}

    items = []
    for row in rows.values():
        row["per_date"] = [{"date": date, **rounded(v)} for date, v in row["per_date"].items()]
        items.append(rounded(row))
    items.sort(key=lambda i: (-i["flood_km2"], not i["touches_coverage"], i["name"]))
    return {
        "region_id": region["id"],
        "source": passes_service.SOURCE,
        "mesh_source": MESH_SOURCE,
        "month": month,
        "dates": [p["data"] for p in chosen],
        "method": METHOD,
        "outside_municipalities": rounded(outside),
        "municipalities": items,
    }
