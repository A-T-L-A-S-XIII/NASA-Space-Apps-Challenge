"""Passagens NISAR já processadas fora da API (pasta NISAR_FOTOS_DIR, hoje Fotos/nisar_taquari_50).

A API só lê os arquivos prontos: catalogo.json e, para cada passagem, a pasta
img_NN_AAAA-MM-DD com area_cheia_seca.geojson, miniatura.png (radar) e slide.png.
Nada é recalculado com imagem aqui; a área de cada polígono é medida em UTM (geo.py).

Cuidados que valem para tudo aqui:
- a área de água depende da trilha (órbita): só compare datas da mesma trilha;
- a área processada vai de Muçum a Lajeado; Bom Retiro do Sul e Taquari ficam de fora.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from shapely.geometry import shape

from app.config import settings
from app.services import geo

SOURCE = "nisar"
# As passagens processadas existem só para o piloto
REGION_ID = "vale-do-taquari"
IMAGES = {"radar": "miniatura.png", "slide": "slide.png"}
FOLDER_RE = re.compile(r"^img_\d{2}_\d{4}-\d{2}-\d{2}$")
FLOOD_CLASSES = ("cheia", "seca")

NOTE = ("Passagens reais do NISAR (L2 GCOV, banda L), processadas antes, fora da API. Cheia é água fora do normal; "
        "seca, falta de água em relação ao normal. A área de água depende da trilha: só compare datas da mesma "
        "trilha. Indicador de mudança de água pelo radar; não é um mapa validado de enchente.")
CAVEATS = [
    "A área de água depende da trilha (órbita): só compare datas da mesma trilha.",
    "A área processada vai de Muçum a Lajeado e pega parte de Estrela; Bom Retiro do Sul e Taquari ficam de fora.",
    "Indicador de mudança de água pelo radar; não é um mapa validado de enchente.",
]


@lru_cache(maxsize=64)
def _read(path: str, mtime: float):
    # mtime entra na chave do cache: se a pasta for reprocessada, o arquivo é lido de novo
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _load(path: Path):
    try:
        return _read(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return None


def root() -> Path:
    return Path(settings.nisar_fotos_dir)


def catalog(region_id: str) -> list[dict] | None:
    """Passagens da região, da mais antiga para a mais recente. None quando não há catálogo."""
    if region_id != REGION_ID:
        return None
    data = _load(root() / "catalogo.json")
    if not isinstance(data, list) or not data:
        return None
    return sorted(data, key=lambda p: p["data"])


def coverage(passes: list[dict]) -> list[float]:
    """Caixa processada [oeste, sul, leste, norte], a partir de limites_leaflet [[sul, oeste], [norte, leste]]."""
    (south, west), (north, east) = passes[0]["limites_leaflet"]
    return [west, south, east, north]


def months(passes: list[dict]) -> list[str]:
    return sorted({p["data"][:7] for p in passes})


def in_month(passes: list[dict], month: str | None) -> list[dict]:
    return [p for p in passes if p["data"].startswith(month)] if month else passes


def find(passes: list[dict], n: int) -> dict | None:
    return next((p for p in passes if p["n"] == n), None)


def folder_name(p: dict) -> str:
    return f"img_{p['n']:02d}_{p['data']}"


def image_url(p: dict, kind: str) -> str | None:
    """URL relativa à raiz da API, ou None se o arquivo não existir."""
    name = IMAGES[kind]
    if not (root() / folder_name(p) / name).is_file():
        return None
    return f"/api/static/nisar/{folder_name(p)}/{name}"


def image_path(folder: str, name: str) -> Path | None:
    """Arquivo de imagem servido em /api/static/nisar. Só pastas img_* e só as imagens conhecidas."""
    if not FOLDER_RE.match(folder) or name not in IMAGES.values():
        return None
    path = root() / folder / name
    return path if path.is_file() else None


def pass_out(region_id: str, p: dict) -> dict:
    return {
        "n": p["n"],
        "date": p["data"],
        "track": p["trilha"],
        "polarization": p["pol"],
        "passes_in_track": p.get("passagens_na_orbita"),
        "water_km2": p["agua_km2"],
        "flood_km2": p["cheia_km2"],
        "dry_km2": p["seca_km2"],
        "in_flood_window": bool(p.get("na_janela_da_enchente")),
        "granule": p["granulo"],
        "images": {kind: image_url(p, kind) for kind in IMAGES},
        "geojson_url": f"/api/regions/{region_id}/passes/{p['n']}/geojson",
    }


def list_passes(region: dict, passes: list[dict], month: str | None) -> dict:
    chosen = in_month(passes, month)
    return {
        "region_id": region["id"],
        "source": SOURCE,
        "data_source": passes[0].get("fonte"),
        "note": NOTE,
        "month": month,
        "months": months(passes),
        "coverage": coverage(passes),
        "count": len(chosen),
        "passes": [pass_out(region["id"], p) for p in chosen],
    }


def features(region: dict, p: dict) -> list[dict]:
    """Polígonos de cheia e seca da passagem, com a área medida em UTM."""
    data = _load(root() / folder_name(p) / "area_cheia_seca.geojson") or {}
    out = []
    for feat in data.get("features") or []:
        cls = (feat.get("properties") or {}).get("classe")
        if cls not in FLOOD_CLASSES:
            continue
        try:
            geom = shape(feat["geometry"])
        except (KeyError, TypeError, ValueError, AttributeError):
            continue  # polígono quebrado não derruba a API
        out.append({
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": {"class": cls, "date": p["data"], "track": p["trilha"], "n": p["n"],
                           "area_km2": round(geo.area_km2(geom, region), 4)},
        })
    return out


def pass_geojson(region: dict, p: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "region_id": region["id"],
        "source": SOURCE,
        "date": p["data"],
        "note": NOTE,
        "features": features(region, p),
    }
