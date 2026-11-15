"""Busca de cenas NISAR no catálogo público do ASF DAAC.

A busca não exige login Earthdata (só o download dos arquivos exige).
Se o ASF falhar ou não houver internet, devolvemos live=False, lista vazia
e o campo "error" — a API nunca quebra por causa disso.
"""

import time

import httpx

from app.config import settings

# Cache em memória: chave da busca -> (expira_em, resultado)
_cache: dict[tuple, tuple[float, dict]] = {}

# Permite trocar o transporte HTTP nos testes (httpx.MockTransport)
_transport: httpx.AsyncBaseTransport | None = None


def clear_cache():
    _cache.clear()


def _first_text(*values):
    """Primeiro valor que seja um texto não vazio."""
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


def _pick_browse(browse):
    """O ASF pode mandar browse como texto ou lista; preferimos a imagem que não é miniatura."""
    if isinstance(browse, str):
        return browse or None
    if isinstance(browse, list):
        urls = [b for b in browse if isinstance(b, str) and b]
        full = [u for u in urls if "thumbnail" not in u.lower()]
        return (full or urls or [None])[0]
    return None


def _size_mb(props: dict):
    """Tamanho do arquivo principal em MB. "bytes" pode ser número ou {arquivo: {"bytes": n}}."""
    raw = props.get("bytes")
    size = None
    if isinstance(raw, (int, float)):
        size = raw
    elif isinstance(raw, dict):
        main = raw.get(props.get("fileName")) if props.get("fileName") else None
        if isinstance(main, dict) and isinstance(main.get("bytes"), (int, float)):
            size = main["bytes"]
        else:
            # Sem o nome do arquivo principal: usa o maior arquivo listado
            sizes = [v.get("bytes") for v in raw.values() if isinstance(v, dict)]
            sizes = [s for s in sizes if isinstance(s, (int, float))]
            size = max(sizes) if sizes else None
    if size is None and isinstance(props.get("sizeMB"), (int, float)):
        return round(props["sizeMB"], 1)
    return round(size / 1024 / 1024, 1) if size is not None else None


def _data_maturity(props: dict):
    """O ASF não tem um campo fixo; usamos dataMaturity se vier ou deduzimos do nome da coleção."""
    if _first_text(props.get("dataMaturity")):
        return props["dataMaturity"]
    collection = (props.get("collectionName") or "").upper()
    for maturity in ["PROVISIONAL", "BETA", "VALIDATED"]:
        if maturity in collection:
            return maturity.lower()
    return None


def parse_scene(feature: dict) -> dict | None:
    """Converte uma feature do geojson do ASF no formato da nossa API."""
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties") or {}
    granule = _first_text(props.get("sceneName"), props.get("fileID"), props.get("granuleName"), props.get("fileName"))
    if granule is None:
        return None
    return {
        "granule": granule,
        "start_time": _first_text(props.get("startTime")),
        "product": _first_text(props.get("processingLevel")),
        "flight_direction": _first_text(props.get("flightDirection")),
        "data_maturity": _data_maturity(props),
        "url": _first_text(props.get("url")),
        "browse": _pick_browse(props.get("browse")),
        "size_mb": _size_mb(props),
        "geometry": feature.get("geometry"),
    }


async def search_scenes(wkt: str, product: str = "GCOV", start: str | None = None,
                        end: str | None = None, limit: int = 25) -> dict:
    """Busca cenas NISAR que cruzam o polígono WKT, da mais recente para a mais antiga."""
    params = {
        "dataset": "NISAR",
        "processingLevel": product,
        "intersectsWith": wkt,
        "output": "geojson",
        "maxResults": limit,
    }
    if start:
        params["start"] = start
    if end:
        params["end"] = end

    key = tuple(sorted(params.items()))
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=settings.asf_timeout_seconds, transport=_transport) as client:
            response = await client.get(settings.asf_search_url, params=params)
            response.raise_for_status()
            data = response.json()
        features = data.get("features") or []
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        return {"live": False, "query": params, "scenes": [], "error": f"Falha ao consultar o ASF: {exc}"}

    scenes = [s for s in (parse_scene(f) for f in features) if s is not None]
    scenes.sort(key=lambda s: s["start_time"] or "", reverse=True)
    result = {"live": True, "query": params, "scenes": scenes, "error": None}

    # Só guarda no cache buscas que deram certo
    _cache[key] = (time.monotonic() + settings.asf_cache_ttl_seconds, result)
    return result
