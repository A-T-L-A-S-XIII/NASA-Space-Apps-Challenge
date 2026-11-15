"""Dados de contexto que vêm de fora: previsão do tempo e busca de lugares.

- Previsão: Open-Meteo (sem chave). É a previsão do tempo para os próximos dias,
  não uma previsão de enchente.
- Lugares: municípios da malha local do IBGE; bairros e ruas pelo Nominatim
  (OpenStreetMap), limitado à caixa do Vale do Taquari.
Respostas ficam em cache em memória para não repetir chamadas.
"""

from __future__ import annotations

import asyncio
import time
import unicodedata
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.data.regions import REGIONS
from app.services.nisar import centroid, get_nisar

_cache: dict[str, tuple[float, dict]] = {}
_nominatim_lock = asyncio.Lock()
_nominatim_last = 0.0
UA = "WaterWaltz/0.1 (NASA Space Apps demo)"


class ExternalError(RuntimeError):
    pass


def _cached(key: str, ttl: int):
    hit = _cache.get(key)
    return hit[1] if hit and time.time() - hit[0] < ttl else None


def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()


# ------------------------------------------------------------------ previsão
async def previsao(lat: float, lon: float, dias: int = 7) -> dict:
    key = f"prev:{lat:.3f}:{lon:.3f}:{dias}"
    if (hit := _cached(key, settings.forecast_cache_ttl_seconds)) is not None:
        return hit
    params = {
        "latitude": lat, "longitude": lon, "timezone": "America/Sao_Paulo", "forecast_days": dias,
        "daily": "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.external_timeout_seconds) as c:
            r = await c.get(settings.open_meteo_url, params=params)
            r.raise_for_status()
            raw = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ExternalError(f"Previsão indisponível agora ({type(e).__name__}).") from e
    d = raw.get("daily") or {}
    datas = d.get("time") or []
    linhas = [{
        "data": dt,
        "chuva_mm": d.get("precipitation_sum", [None] * len(datas))[i],
        "prob_chuva": d.get("precipitation_probability_max", [None] * len(datas))[i],
        "tmin": d.get("temperature_2m_min", [None] * len(datas))[i],
        "tmax": d.get("temperature_2m_max", [None] * len(datas))[i],
    } for i, dt in enumerate(datas)]
    total = round(sum(x["chuva_mm"] or 0 for x in linhas), 1)
    pico = max(linhas, key=lambda x: x["chuva_mm"] or 0) if linhas else None
    if not linhas:
        frase = "Sem previsão para os próximos dias."
    elif total < 5:
        frase = f"Pouca ou nenhuma chuva prevista nos próximos {len(linhas)} dias."
    else:
        dd = pico["data"].split("-")
        frase = (f"Chuva prevista de {str(total).replace('.', ',')} mm nos próximos {len(linhas)} dias, "
                 f"mais forte em {dd[2]}/{dd[1]}.")
    out = {
        "fonte": "Open-Meteo (modelos meteorológicos globais)",
        "tipo": "previsão do tempo, não previsão de enchente",
        "lat": lat, "lon": lon,
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "chuva_total_mm": total, "frase": frase, "dias": linhas,
    }
    _cache[key] = (time.time(), out)
    return out


# ------------------------------------------------------------------- lugares
def _dentro(lat: float, lon: float) -> bool:
    c = get_nisar().cover
    return c["sul"] <= lat <= c["norte"] and c["oeste"] <= lon <= c["leste"]


def municipios_locais(q: str) -> list[dict]:
    n = _norm(q)
    out = []
    for f in get_nisar().municipios["features"]:
        nome = f["properties"]["name"]
        if n and n in _norm(nome):
            lon, lat = centroid(f["geometry"])
            out.append({"nome": nome, "tipo": "município", "lat": round(lat, 5), "lon": round(lon, 5),
                        "dentro_da_area_coberta": _dentro(lat, lon), "fonte": "IBGE"})
    out.sort(key=lambda i: (not _norm(i["nome"]).startswith(n), i["nome"]))
    return out


async def _nominatim(q: str) -> list[dict]:
    global _nominatim_last
    key = f"nom:{_norm(q)}"
    if (hit := _cached(key, 24 * 3600)) is not None:
        return hit["itens"]
    w, s, e, n = REGIONS["vale-do-taquari"]["bbox"]
    params = {"q": q, "format": "jsonv2", "countrycodes": "br", "limit": 8, "bounded": 1,
              "viewbox": f"{w},{n},{e},{s}", "addressdetails": 1, "accept-language": "pt-BR"}
    async with _nominatim_lock:  # política do Nominatim: no máximo 1 pedido por segundo
        wait = 1.0 - (time.time() - _nominatim_last)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=settings.external_timeout_seconds, headers={"User-Agent": UA}) as c:
                r = await c.get(settings.nominatim_url, params=params)
                r.raise_for_status()
                raw = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise ExternalError(f"Busca de bairros indisponível agora ({type(e).__name__}).") from e
        finally:
            _nominatim_last = time.time()
    itens = []
    for x in raw:
        a = x.get("address") or {}
        cidade = a.get("city") or a.get("town") or a.get("village") or a.get("municipality") or ""
        nome = x.get("name") or x.get("display_name", "").split(",")[0]
        tipo = {"suburb": "bairro", "neighbourhood": "bairro", "quarter": "bairro", "residential": "bairro"}.get(
            x.get("addresstype") or x.get("type"), x.get("addresstype") or x.get("type") or "lugar")
        lat, lon = float(x["lat"]), float(x["lon"])
        itens.append({"nome": f"{nome}, {cidade}" if cidade and cidade != nome else nome, "tipo": tipo,
                      "lat": round(lat, 5), "lon": round(lon, 5),
                      "dentro_da_area_coberta": _dentro(lat, lon), "fonte": "OpenStreetMap (Nominatim)"})
    _cache[key] = (time.time(), {"itens": itens})
    return itens


async def lugares(q: str) -> dict:
    locais = municipios_locais(q)
    erro = None
    externos: list[dict] = []
    if len(q.strip()) >= 3:
        try:
            externos = await _nominatim(q)
        except ExternalError as e:
            erro = str(e)
    vistos = {_norm(i["nome"]) for i in locais}
    itens = locais + [i for i in externos if _norm(i["nome"]) not in vistos]
    return {"q": q, "itens": itens[:12], "erro_bairros": erro}
