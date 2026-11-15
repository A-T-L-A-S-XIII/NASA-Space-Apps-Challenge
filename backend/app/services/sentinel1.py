"""Recorrência de alagamento do histórico Sentinel-1, gerada antes por scripts/process_sentinel1.py.

O arquivo traz, para a região, as manchas por classe (pontual, voltou, recorrente, permanente)
e a área alagada de cada mês. A API só lê e resume; nada é calculado com imagem aqui.
"""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Point, shape

from app.config import settings
from app.services import geo

# Uma cidade recebe a classe quando ela cobre pelo menos esta fração do círculo de 1 km em volta
# do centro. É menor que o critério da mancha do mês (30%) porque a recorrência é parcial: o núcleo
# urbano costuma alagar só na parte baixa, perto do rio.
CITY_RECURRENCE_FRACTION = 0.1

# Da mais forte para a mais fraca; "permanente" (o leito do rio) não conta para as cidades
FLOOD_CLASSES = ["recorrente", "voltou", "pontual"]


@lru_cache(maxsize=8)
def _read(path: str, mtime: float) -> dict:
    # mtime entra na chave do cache: se o script reprocessar, o arquivo é lido de novo
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_recurrence(region_id: str) -> dict | None:
    path = Path(settings.sentinel1_dir) / f"{region_id}_recorrencia.geojson"
    try:
        return _read(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return None  # sem arquivo (ou quebrado): a rota responde 404


def city_recurrence(data: dict, region: dict) -> list[dict]:
    """Classe de cada cidade: a mais forte que cobre pelo menos 10% do núcleo urbano.

    "sem_registro" não quer dizer que a cidade nunca alagou: o radar não vê água entre prédios e,
    passando a cada 12 dias, quase nunca pega o pico de uma enchente que dura 2 ou 3 dias."""
    by_class = {f["properties"]["class"]: geo.to_metric(shape(f["geometry"]), region) for f in data["features"]}
    result = []
    for city in region["cities"]:
        core = geo.to_metric(Point(city["lon"], city["lat"]), region).buffer(geo.CITY_RADIUS_M)
        shares = {c: by_class[c].intersection(core).area / core.area for c in FLOOD_CLASSES if c in by_class}
        flooded = sum(shares.values())
        strongest = next((c for c in FLOOD_CLASSES if shares.get(c, 0) >= CITY_RECURRENCE_FRACTION), None)
        result.append({
            "city_id": city["id"],
            "name": city["name"],
            "class": strongest or "sem_registro",
            "flooded_share": round(flooded, 3),
        })
    return result


def recurrence_note(meta: dict) -> str:
    return (f"Histórico real do Sentinel-1 (banda C, {meta['polarization']}), {meta['images']} passagens da órbita "
            f"{meta['relative_orbit']} entre {meta['period']['start']} e {meta['period']['end']}. Água = retorno "
            f"abaixo de {meta['threshold_db']} dB, sem encostas acima de {meta['max_slope_deg']}°. Conta em quantos "
            f"meses diferentes cada ponto alagou fora do leito do rio. É um indicador de recorrência, não um mapa "
            f"oficial de risco. O satélite passa a cada 12 dias e as enchentes do Taquari sobem e descem em 2 ou 3, então "
            f"o pico costuma ficar de fora; o radar também não vê água entre prédios nem embaixo de vegetação densa. "
            f"Por isso uma cidade \"sem_registro\" pode ter alagado.")
