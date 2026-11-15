"""Índice ONI (El Niño / La Niña) da NOAA.

O arquivo da NOAA tem uma linha por estação de 3 meses (DJF, JFM, ..., NDJ),
com as colunas SEAS YR TOTAL ANOM. Cada estação é associada ao mês central:
DJF 2024 -> 2024-01, NDJ 2023 -> 2023-12.

Cache de 6 h. Se a NOAA falhar, devolvemos o último cache (mesmo vencido)
com live=False e "error"; sem cache, live=False e série vazia.
"""

import time
from datetime import datetime, timezone

import httpx

from app.config import settings

SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]

# Último resultado bom da NOAA e quando ele vence
_cache: dict = {"data": None, "expires": 0.0, "retry_at": 0.0}

# Permite trocar o transporte HTTP nos testes (httpx.MockTransport)
_transport: httpx.AsyncBaseTransport | None = None


def clear_cache():
    _cache.update(data=None, expires=0.0, retry_at=0.0)


def classify(anom: float) -> str:
    if anom >= 0.5:
        return "El Niño"
    if anom <= -0.5:
        return "La Niña"
    return "Neutro"


def parse_oni(text: str) -> list[dict]:
    """Lê o arquivo texto da NOAA. Linhas que não seguem o formato são ignoradas."""
    series = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 4 or parts[0] not in SEASONS:
            continue
        try:
            year, total, anom = int(parts[1]), float(parts[2]), float(parts[3])
        except ValueError:
            continue
        month = SEASONS.index(parts[0]) + 1  # mês central da estação
        series.append({
            "season": parts[0],
            "year": year,
            "month": f"{year}-{month:02d}",
            "total": total,
            "oni": anom,
            "phase": classify(anom),
        })
    return series


async def get_enso() -> dict:
    """Série ONI completa, do cache quando possível."""
    now = time.monotonic()
    cached = _cache["data"]
    if cached and _cache["expires"] > now:
        return cached

    # Falhou há pouco: não espera o timeout da NOAA de novo a cada requisição
    if _cache["retry_at"] > now:
        return _fallback(cached, _cache.get("error"))

    try:
        async with httpx.AsyncClient(timeout=settings.enso_timeout_seconds, transport=_transport) as client:
            response = await client.get(settings.noaa_oni_url)
            response.raise_for_status()
        series = parse_oni(response.text)
        if not series:
            raise ValueError("arquivo sem linhas no formato SEAS YR TOTAL ANOM")
    except (httpx.HTTPError, ValueError) as exc:
        error = f"Falha ao consultar a NOAA: {exc}"
        _cache.update(retry_at=now + settings.enso_retry_seconds, error=error)
        return _fallback(cached, error)

    data = {
        "live": True,
        "source": "NOAA CPC",
        "url": settings.noaa_oni_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "series": series,
        "error": None,
    }
    _cache.update(data=data, expires=now + settings.enso_cache_ttl_seconds, retry_at=0.0, error=None)
    return data


def _fallback(cached: dict | None, error: str | None) -> dict:
    if cached:
        return {**cached, "live": False, "error": error}
    return {
        "live": False,
        "source": "NOAA CPC",
        "url": settings.noaa_oni_url,
        "fetched_at": None,
        "series": [],
        "error": error,
    }


def by_month(enso: dict) -> dict[str, dict]:
    """Índice {YYYY-MM: ponto da série} para cruzar com outras séries mensais."""
    return {point["month"]: point for point in enso["series"]}
