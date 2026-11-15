"""Busca de lugares: municípios da malha local do IBGE e bairros do Nominatim (OpenStreetMap).

- Municípios: busca local, sem rede, pelo nome sem acento.
- Bairros e ruas: Nominatim, só a partir de 3 letras e limitado à caixa da região.
  A política de uso do Nominatim pede um User-Agent que identifique o app e no
  máximo 1 pedido por segundo; o lock abaixo garante isso dentro do processo.
  Respostas ficam 24 h em cache. Se o Nominatim falhar, os municípios continuam
  saindo e "error" explica a falha. Com OFFLINE_MODE=true, só a busca local.
"""

import asyncio
import time
import unicodedata

import httpx
from shapely.geometry import Point, box

from app.config import settings
from app.services import municipalities
from app.services import passes as passes_service

SOURCE = "ibge+osm"
MAX_ITEMS = 12
NOMINATIM_MIN_CHARS = 3
NEIGHBOURHOOD = {"suburb", "neighbourhood", "quarter", "residential", "city_district"}

# Consulta normalizada -> (expira_em, itens)
_cache: dict[str, tuple[float, list[dict]]] = {}
_lock = asyncio.Lock()
_last_request = 0.0

# Permite trocar o transporte HTTP nos testes (httpx.MockTransport)
_transport: httpx.AsyncBaseTransport | None = None


def clear_cache():
    global _last_request
    _cache.clear()
    _last_request = 0.0


def normalize(text: str) -> str:
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode().lower().strip()


def coverage_box(region: dict):
    """Área observada pelo radar: a caixa das passagens processadas, ou a da região se não houver."""
    passes = passes_service.catalog(region["id"])
    return box(*(passes_service.coverage(passes) if passes else region["bbox"]))


def local_municipalities(q: str, region: dict) -> list[dict]:
    if municipalities.load_mesh() is None:
        return []
    n = normalize(q)
    cover = coverage_box(region)
    out = []
    for props, geom, _ in municipalities.shapes():
        if n not in normalize(props["name"]):
            continue
        center = geom.representative_point()  # sempre dentro do polígono
        out.append({"name": props["name"], "kind": "município", "lat": round(center.y, 5),
                    "lon": round(center.x, 5), "inside_coverage": cover.contains(center), "source": "ibge"})
    # Primeiro os que começam com o texto digitado
    out.sort(key=lambda i: (not normalize(i["name"]).startswith(n), i["name"]))
    return out


def parse_nominatim(raw: list, region: dict) -> list[dict]:
    cover = coverage_box(region)
    items = []
    for x in raw if isinstance(raw, list) else []:
        try:
            lat, lon = float(x["lat"]), float(x["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        address = x.get("address") or {}
        city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
        name = x.get("name") or (x.get("display_name") or "").split(",")[0]
        if not name:
            continue
        osm_type = x.get("addresstype") or x.get("type") or "lugar"
        items.append({
            "name": f"{name}, {city}" if city and city != name else name,
            "kind": "bairro" if osm_type in NEIGHBOURHOOD else osm_type,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "inside_coverage": cover.contains(Point(lon, lat)),
            "source": "osm",
        })
    return items


async def nominatim(q: str, region: dict) -> list[dict]:
    """Bairros e ruas do Nominatim dentro da caixa da região. Levanta httpx.HTTPError ou ValueError se falhar."""
    global _last_request
    key = f"{region['id']}:{normalize(q)}"
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    west, south, east, north = region["bbox"]
    params = {"q": q, "format": "jsonv2", "countrycodes": "br", "limit": 8, "bounded": 1,
              "viewbox": f"{west},{north},{east},{south}", "addressdetails": 1, "accept-language": "pt-BR"}
    async with _lock:  # um pedido por vez, com intervalo mínimo entre eles
        wait = settings.nominatim_min_interval_seconds - (time.monotonic() - _last_request)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=settings.places_timeout_seconds, transport=_transport,
                                         headers={"User-Agent": settings.nominatim_user_agent}) as client:
                response = await client.get(settings.nominatim_url, params=params)
                response.raise_for_status()
                raw = response.json()
        finally:
            _last_request = time.monotonic()

    items = parse_nominatim(raw, region)
    _cache[key] = (time.monotonic() + settings.places_cache_ttl_seconds, items)
    return items


async def search(q: str, region: dict) -> dict:
    local = local_municipalities(q, region)
    external, error = [], None
    if settings.offline_mode:
        error = "Modo offline: a busca de bairros não é consultada"
    elif len(q.strip()) >= NOMINATIM_MIN_CHARS:
        try:
            external = await nominatim(q, region)
        except (httpx.HTTPError, ValueError) as exc:
            error = f"Busca de bairros indisponível agora: {exc}"
    seen = {normalize(i["name"]) for i in local}
    items = local + [i for i in external if normalize(i["name"]) not in seen]
    return {"q": q, "region_id": region["id"], "source": SOURCE, "items": items[:MAX_ITEMS], "error": error}
