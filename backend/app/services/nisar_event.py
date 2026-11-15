"""Evento NISAR processado pela equipe (hoje: enchente de julho de 2026 no Vale do Taquari).

Os arquivos ficam em app/data/nisar/<pasta>/ e vieram do frontend (frontend/data/taquari/):
- dados.json: metadados do evento (cenas de antes e depois, água antes e depois, água nova)
- area_alagada.json: polígonos da água NOVA entre as duas cenas
- passagens.json: catálogo das passagens (área de água de cada uma, por trilha)

As imagens (radar, mapa ilustrado, quadros das passagens) continuam em frontend/public/nisar/.
"""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Polygon, shape
from shapely.ops import unary_union

from app.config import settings

# Id da região -> pasta dos arquivos em app/data/nisar/
EVENT_FOLDERS = {"vale-do-taquari": "taquari"}

# Uma cidade conta como atingida pela água nova se algum polígono fica a até esta distância do centro.
# É a mesma regra de "afetada" do frontend; a regra de 30% do núcleo (geo.affected_cities) não pega
# os polígonos reais, que são faixas estreitas nas margens do rio.
NEAR_CITY_M = 1200


@lru_cache(maxsize=16)
def _read(path: str, mtime: float) -> dict:
    # mtime entra na chave do cache: se o arquivo for trocado, é lido de novo
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _path(region_id: str, name: str) -> Path | None:
    folder = EVENT_FOLDERS.get(region_id)
    if folder is None:
        return None
    path = Path(settings.nisar_dir) / folder / name
    return path if path.is_file() else None


def _load(region_id: str, name: str) -> dict | None:
    path = _path(region_id, name)
    if path is None:
        return None
    try:
        return _read(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return None


def load_event(region_id: str) -> dict | None:
    """Conteúdo do dados.json, ou None se a região não tiver evento processado."""
    return _load(region_id, "dados.json")


def load_passes(region_id: str) -> dict | None:
    """Conteúdo do passagens.json, ou None."""
    return _load(region_id, "passagens.json")


@lru_cache(maxsize=16)
def _union(path: str, mtime: float):
    return unary_union([shape(f["geometry"]) for f in _read(path, mtime)["features"]])


def new_water(region_id: str):
    """Polígonos de água nova unidos numa geometria (lon/lat), ou None."""
    path = _path(region_id, "area_alagada.json")
    if path is None:
        return None
    try:
        return _union(str(path), path.stat().st_mtime)
    except (OSError, ValueError, KeyError):
        return None


def polygon_count(region_id: str) -> int:
    data = _load(region_id, "area_alagada.json")
    return len(data["features"]) if data else 0


def _br(day: str) -> str:
    """2026-07-23 -> 23/07/2026."""
    return f"{day[8:10]}/{day[5:7]}/{day[:4]}"


def _km2(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def event_note(event: dict) -> str:
    return (f"Dado real do {event['satelite']} ({event['produto']}), processado pela equipe. "
            f"Cenas de {_br(event['data_antes'])} e {_br(event['data_depois'])}. "
            f"Indicador de mudança de água a partir de radar, não um mapa validado de enchente.")


def before_note(event: dict) -> str:
    return (f"Cena de referência ({_br(event['data_antes'])}) do evento NISAR: a mancha de água nova começa vazia "
            f"e aparece na cena de {_br(event['data_depois'])}. A água total medida nesta cena foi de "
            f"{_km2(event['agua_antes_km2'])} km² (ver /event). " + event_note(event))


def after_note(event: dict, polygons: int) -> str:
    return (f"Água NOVA detectada pelo NISAR entre {_br(event['data_antes'])} e {_br(event['data_depois'])}: "
            f"{polygons} polígonos fora do leito do rio. Não é a água total: ela passou de "
            f"{_km2(event['agua_antes_km2'])} para {_km2(event['agua_depois_km2'])} km² (ver /event). "
            f"Cidades atingidas = água nova a até {_km2(NEAR_CITY_M / 1000)} km do centro. " + event_note(event))


def passes_note() -> str:
    return ("Área de água de cada passagem do NISAR no recorte de Muçum a Lajeado (Estrela, Bom Retiro do Sul e "
            "Taquari ficam de fora). A área muda com a trilha: a 053_D mede menos que a 103_A no mesmo rio, então "
            "só compare passagens da mesma trilha. cheia_km2 e seca_km2 são a água acima e abaixo do normal da "
            "época. Os quadros (img) ficam em frontend/public/nisar/passagens/.")


def empty_geometry():
    return Polygon()


def event_response(region_id: str) -> dict | None:
    """Resposta do /event: dados.json + source, note e número de polígonos."""
    event = load_event(region_id)
    if event is None:
        return None
    return {"region_id": region_id, "source": "nisar", "note": event_note(event),
            "poligonos": polygon_count(region_id), **event}


def passes_response(region_id: str) -> dict | None:
    """Resposta do /passes: passagens.json + source e note."""
    catalog = load_passes(region_id)
    if catalog is None:
        return None
    return {"region_id": region_id, "source": "nisar", "note": passes_note(),
            "count": len(catalog["passagens"]), **catalog}
