"""Previsão do tempo da Open-Meteo (sem chave) para o centro da região.

É a previsão do tempo dos próximos dias, não uma previsão de enchente.
Cache de 30 min por região e número de dias. Se a Open-Meteo falhar,
devolvemos o último cache (mesmo vencido) com live=False e "error"; sem
cache, a lista de dias vem vazia — a API nunca quebra por causa disso.
Com OFFLINE_MODE=true, a Open-Meteo nem é chamada.
"""

import time
from datetime import datetime, timezone

import httpx

from app.config import settings

SOURCE = "open-meteo"
KIND = "Previsão do tempo, não previsão de enchente."
DAILY = "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min"

# (região, dias) -> {"data", "expires", "retry_at", "error"}
_cache: dict[tuple[str, int], dict] = {}

# Permite trocar o transporte HTTP nos testes (httpx.MockTransport)
_transport: httpx.AsyncBaseTransport | None = None


def clear_cache():
    _cache.clear()


def _fmt_mm(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def summary(days: list[dict]) -> str:
    """Frase curta para o cidadão."""
    if not days:
        return "Sem previsão para os próximos dias."
    total = sum(d["rain_mm"] or 0 for d in days)
    if total < 5:
        return f"Pouca ou nenhuma chuva prevista nos próximos {len(days)} dias."
    peak = max(days, key=lambda d: d["rain_mm"] or 0)
    _, month, day = peak["date"].split("-")
    return f"Chuva prevista de {_fmt_mm(total)} mm nos próximos {len(days)} dias, mais forte em {day}/{month}."


def parse_daily(raw: dict) -> list[dict]:
    """Converte o bloco "daily" da Open-Meteo em uma linha por dia. Colunas que faltarem viram null."""
    daily = raw.get("daily") or {}
    dates = daily.get("time") or []

    def col(name: str) -> list:
        values = daily.get(name) or []
        return values + [None] * (len(dates) - len(values))

    rain, prob = col("precipitation_sum"), col("precipitation_probability_max")
    tmin, tmax = col("temperature_2m_min"), col("temperature_2m_max")
    return [{"date": d, "rain_mm": rain[i], "rain_probability_pct": prob[i], "tmin_c": tmin[i], "tmax_c": tmax[i]}
            for i, d in enumerate(dates)]


def _result(region: dict, days: list[dict], live: bool, error: str | None, generated_at: str | None) -> dict:
    lat, lon = region["center"]
    return {
        "region_id": region["id"],
        "source": SOURCE,
        "live": live,
        "kind": KIND,
        "lat": lat,
        "lon": lon,
        "generated_at": generated_at,
        "total_rain_mm": round(sum(d["rain_mm"] or 0 for d in days), 1),
        "summary": summary(days),
        "days": days,
        "error": error,
    }


async def get_forecast(region: dict, days: int = 7) -> dict:
    key = (region["id"], days)
    entry = _cache.setdefault(key, {"data": None, "expires": 0.0, "retry_at": 0.0, "error": None})
    cached = entry["data"]
    if settings.offline_mode:
        return _fallback(region, cached, "Modo offline: a previsão não é consultada")

    now = time.monotonic()
    if cached and entry["expires"] > now:
        return cached
    # Falhou há pouco: não espera o timeout de novo a cada requisição
    if entry["retry_at"] > now:
        return _fallback(region, cached, entry["error"])

    lat, lon = region["center"]
    params = {"latitude": lat, "longitude": lon, "timezone": "America/Sao_Paulo",
              "forecast_days": days, "daily": DAILY}
    try:
        async with httpx.AsyncClient(timeout=settings.forecast_timeout_seconds, transport=_transport) as client:
            response = await client.get(settings.open_meteo_url, params=params)
            response.raise_for_status()
            rows = parse_daily(response.json())
        if not rows:
            raise ValueError("resposta sem dias")
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        error = f"Falha ao consultar a Open-Meteo: {exc}"
        entry.update(retry_at=now + settings.forecast_retry_seconds, error=error)
        return _fallback(region, cached, error)

    data = _result(region, rows, True, None, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    entry.update(data=data, expires=now + settings.forecast_cache_ttl_seconds, retry_at=0.0, error=None)
    return data


def _fallback(region: dict, cached: dict | None, error: str | None) -> dict:
    if cached:
        return {**cached, "live": False, "error": error}
    return _result(region, [], False, error, None)
