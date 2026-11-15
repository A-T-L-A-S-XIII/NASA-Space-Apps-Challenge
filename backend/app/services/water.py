"""Linha do tempo, mancha d'água e comparação antes/depois.

Tudo aqui é independente da fonte: os dados vêm de um WaterProvider
(app/providers) e o ONI vem da NOAA (app/services/enso.py).
"""

import asyncio
import csv
import io
import re
import statistics
from datetime import date, datetime, timedelta, timezone

from app.data.regions import bbox_to_wkt
from app.providers import WaterMask, WaterProvider
from app.services import asf, enso, geo, nisar_event

MONTH_NAMES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


# Uma cena NISAR serve de imagem do "antes/depois" se for de até 30 dias do meio do mês
BROWSE_MAX_DAYS = 30

# Limite de meses em /water-mask/frames, para a resposta não ficar pesada
MAX_FRAMES = 120


class InvalidMonth(ValueError):
    pass


def parse_month(value: str, field: str) -> str:
    """Valida "YYYY-MM" e recusa meses no futuro. Devolve o texto normalizado."""
    try:
        year, month = value.split("-")
        year, month = int(year), int(month)
        if len(value) != 7 or not 1 <= month <= 12 or year < 1950:
            raise ValueError
    except ValueError:
        raise InvalidMonth(f"Mês inválido em '{field}': use o formato AAAA-MM (ex.: 2024-05)")
    normalized = f"{year}-{month:02d}"
    if normalized > current_month():
        raise InvalidMonth(f"O mês em '{field}' está no futuro")
    return normalized


DAY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_day(value: str) -> bool:
    return len(value) == 10


def parse_date(value: str, field: str) -> str:
    """Aceita "YYYY-MM" (mês) ou "YYYY-MM-DD" (dia de uma passagem). Recusa datas no futuro."""
    if not is_day(value):
        return parse_month(value, field)
    try:
        if not DAY_PATTERN.match(value):
            raise ValueError
        day = date.fromisoformat(value)
        if day.year < 1950:
            raise ValueError
    except ValueError:
        raise InvalidMonth(f"Data inválida em '{field}': use o formato AAAA-MM-DD (ex.: 2026-07-23) ou AAAA-MM")
    if day > date.today():
        raise InvalidMonth(f"A data em '{field}' está no futuro")
    return value


def day_bounds(start: str, end: str) -> tuple[str, str]:
    """Primeiro e último dia do intervalo, com start/end em mês ou dia (para comparar como texto)."""
    return (start if is_day(start) else f"{start}-01"), (end if is_day(end) else f"{end}-31")


def current_month() -> str:
    return date.today().strftime("%Y-%m")


def month_range(start: str, end: str) -> list[str]:
    year, month = int(start[:4]), int(start[5:])
    months = []
    while f"{year}-{month:02d}" <= end:
        months.append(f"{year}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return months


def month_label(month: str) -> str:
    """2024-05 -> "maio de 2024"."""
    return f"{MONTH_NAMES[int(month[5:7]) - 1]} de {month[:4]}"


def date_label(value: str) -> str:
    """2024-05 -> "maio de 2024"; 2026-07-23 -> "23 de julho de 2026"."""
    return f"{int(value[8:])} de {month_label(value)}" if is_day(value) else month_label(value)


def classify_status(anomaly_pct: float) -> str:
    if anomaly_pct <= -25:
        return "seca"
    if anomaly_pct < 30:
        return "normal"
    if anomaly_pct < 80:
        return "alerta"
    return "enchente"


def _stats(mask: WaterMask, baseline_km2: float, region: dict) -> dict:
    area = geo.area_km2(mask.geometry, region)
    anomaly = mask.anomaly_pct if mask.anomaly_pct is not None else (area / baseline_km2 - 1) * 100
    return {
        "date": mask.date,
        "water_area_km2": round(area, 2),
        "anomaly_pct": round(anomaly, 1),
        "status": classify_status(anomaly),
        "event": mask.event,
        "source": mask.source,
    }


def _baseline_km2(provider: WaterProvider, region: dict, mask: WaterMask | None = None) -> float:
    base = provider.baseline_for(region, mask) if mask is not None else provider.baseline(region)
    return geo.area_km2(base.geometry, region)


def _overall_source(sources: set[str], provider: WaterProvider) -> str:
    """Se algum mês é demo, a resposta toda é marcada como demo."""
    if "demo" in sources:
        return "demo"
    return sources.pop() if len(sources) == 1 else provider.source


def _cities(mask: WaterMask, region: dict) -> list[str]:
    if mask.near_cities_m is not None:
        return geo.cities_near(mask.geometry, region, mask.near_cities_m)
    return geo.affected_cities(mask.geometry, region)


async def timeline(provider: WaterProvider, region: dict, start: str, end: str) -> dict:
    if is_day(start) or is_day(end):
        return await daily_timeline(region, start, end)
    baseline_km2 = _baseline_km2(provider, region)
    climate = await enso.get_enso()
    oni_by_month = enso.by_month(climate)

    series, notes, sources = [], set(), set()
    for month in month_range(start, end):
        mask = provider.water_mask(region, month)
        sources.add(mask.source)
        if mask.note:
            notes.add(mask.note)
        oni = oni_by_month.get(month)
        series.append({
            **_stats(mask, _baseline_km2(provider, region, mask), region),
            "oni": oni["oni"] if oni else None,
            "enso_phase": oni["phase"] if oni else None,
        })

    return {
        "region_id": region["id"],
        "source": _overall_source(sources, provider),
        "note": " ".join(sorted(notes)) or None,
        "start": start,
        "end": end,
        "baseline_km2": round(baseline_km2, 2),
        "enso": {"live": climate["live"], "source": climate["source"], "error": climate["error"],
                 "snapshot_date": climate.get("snapshot_date")},
        "series": series,
    }


async def daily_timeline(region: dict, start: str, end: str) -> dict:
    """Série por dia: uma linha por passagem do catálogo NISAR (passagens.json) no intervalo.

    A área muda com a trilha, então a anomalia de cada passagem compara com a mediana da mesma trilha.
    """
    catalog = nisar_event.load_passes(region["id"])
    passes = catalog["passagens"] if catalog else []
    lo, hi = day_bounds(start, end)
    by_track = {}
    for p in passes:
        by_track.setdefault(p["trilha"], []).append(p["agua_km2"])
    climate = await enso.get_enso()
    oni_by_month = enso.by_month(climate)

    series = []
    for p in passes:
        if not lo <= p["data"] <= hi:
            continue
        median = statistics.median(by_track[p["trilha"]])
        anomaly = (p["agua_km2"] / median - 1) * 100 if median else 0.0
        oni = oni_by_month.get(p["data"][:7])
        series.append({
            "date": p["data"],
            "water_area_km2": p["agua_km2"],
            "anomaly_pct": round(anomaly, 1),
            "status": classify_status(anomaly),
            "oni": oni["oni"] if oni else None,
            "enso_phase": oni["phase"] if oni else None,
            "event": None,
            "source": "nisar",
            "track": p["trilha"],
        })

    note = nisar_event.passes_note() + " A anomalia compara cada passagem com a mediana da mesma trilha."
    return {
        "region_id": region["id"],
        "source": "nisar",
        "note": note if catalog else "Sem catálogo de passagens NISAR para esta região.",
        "start": start,
        "end": end,
        "baseline_km2": None,
        "enso": {"live": climate["live"], "source": climate["source"], "error": climate["error"],
                 "snapshot_date": climate.get("snapshot_date")},
        "series": series,
    }


def _collection(mask: WaterMask, provider: WaterProvider, region: dict) -> dict:
    properties = {
        **_stats(mask, _baseline_km2(provider, region, mask), region),
        "cidades_atingidas": _cities(mask, region),
        "note": mask.note,
    }
    return {
        "type": "FeatureCollection",
        "region_id": region["id"],
        "date": mask.date,
        "source": mask.source,
        "note": mask.note,
        "features": [{"type": "Feature", "geometry": geo.to_geojson(mask.geometry), "properties": properties}],
    }


def water_mask_geojson(provider: WaterProvider, region: dict, month: str) -> dict:
    """Mancha do mês (YYYY-MM) ou do dia (YYYY-MM-DD). Dia sem passagem real vira o mês dele."""
    return _collection(provider.water_mask(region, month), provider, region)


def frame_dates(provider: WaterProvider, region: dict, start: str, end: str) -> list[str]:
    """Meses do intervalo, ou, com start/end em dia, só os dias com passagem real."""
    if is_day(start) or is_day(end):
        return provider.days(region, *day_bounds(start, end))
    return month_range(start, end)


def frames(provider: WaterProvider, region: dict, start: str, end: str) -> dict:
    """Todas as manchas de start a end, com geometria simplificada, para a linha do tempo animada."""
    items, notes, sources = [], set(), set()
    for when in frame_dates(provider, region, start, end):
        mask = provider.water_mask(region, when)
        stats = _stats(mask, _baseline_km2(provider, region, mask), region)
        notes.add(mask.note)
        sources.add(mask.source)
        items.append({
            "date": mask.date,
            "status": stats["status"],
            "water_area_km2": stats["water_area_km2"],
            "source": mask.source,
            "geojson": geo.simplified_geojson(mask.geometry, region),
        })
    return {
        "region_id": region["id"],
        "source": _overall_source(sources, provider) if sources else provider.source,
        "note": " ".join(sorted(notes - {None})) or None,
        "start": start,
        "end": end,
        "count": len(items),
        "frames": items,
    }


def _scene_time(scene: dict) -> datetime | None:
    try:
        return datetime.fromisoformat(scene["start_time"].replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return None


async def nearest_browse(region: dict, month: str) -> dict | None:
    """Cena NISAR com imagem (browse) mais perto do dia pedido (ou do dia 15 do mês), ou None."""
    day = int(month[8:]) if is_day(month) else 15
    target = datetime(int(month[:4]), int(month[5:7]), day, tzinfo=timezone.utc)
    window = timedelta(days=BROWSE_MAX_DAYS)
    result = await asf.search_scenes(
        bbox_to_wkt(region["bbox"]), product="GCOV",
        start=(target - window).date().isoformat(), end=(target + window).date().isoformat(), limit=100,
    )
    candidates = []
    for scene in result["scenes"]:
        when = _scene_time(scene)
        if scene.get("browse") and when and abs(when - target) <= window:
            candidates.append((abs(when - target), scene))
    if not candidates:
        return None
    return min(candidates, key=lambda c: c[0])[1]


async def compare(provider: WaterProvider, region: dict, before: str, after: str) -> dict:
    browse = dict(zip(["before", "after"], await asyncio.gather(
        nearest_browse(region, before), nearest_browse(region, after),
    )))
    sides, masks = {}, {}
    for key, when in [("before", before), ("after", after)]:
        masks[key] = provider.water_mask(region, when)
        collection = _collection(masks[key], provider, region)
        props = collection["features"][0]["properties"]
        sides[key] = {
            "date": collection["date"],
            "water_area_km2": props["water_area_km2"],
            "status": props["status"],
            "cidades_atingidas": props["cidades_atingidas"],
            "geojson": collection,
            "browse_url": browse[key]["browse"] if browse[key] else None,
            "browse_date": browse[key]["start_time"] if browse[key] else None,
        }

    area_before = sides["before"]["water_area_km2"]
    area_after = sides["after"]["water_area_km2"]
    delta_km2 = round(area_after - area_before, 2)
    delta_pct = round(delta_km2 / area_before * 100, 1) if area_before else None
    sources = {sides["before"]["geojson"]["source"], sides["after"]["geojson"]["source"]}
    notes = {sides["before"]["geojson"]["note"], sides["after"]["geojson"]["note"]} - {None}

    return {
        "region_id": region["id"],
        "source": "demo" if "demo" in sources else sources.pop(),
        "note": " ".join(sorted(notes)) or None,
        "before": sides["before"],
        "after": sides["after"],
        "delta_km2": delta_km2,
        "delta_pct": delta_pct,
        "cidades_atingidas": sides["after"]["cidades_atingidas"],
        "summary": summary(region, sides["before"], sides["after"], delta_pct, "demo" in sources,
                           near_m=masks["after"].near_cities_m),
    }


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " e " + names[-1]


def _km2(value: float) -> str:
    return f"{value:.0f}".replace(".", ",") if value >= 10 else f"{value:.1f}".replace(".", ",")


def _rise_text(status: str) -> str:
    if status in ("enchente", "alerta"):
        return "o rio saiu do leito e se espalhou"
    return "o rio subiu, mas segue dentro do esperado" if status == "normal" else "o rio subiu um pouco, mas segue baixo"


def _fall_text(status: str) -> str:
    if status == "seca":
        return "o rio ficou abaixo do normal, sinal de estiagem"
    return "a água baixou" if status == "normal" else "a água baixou, mas o rio segue acima do normal"


def summary(region: dict, before: dict, after: dict, delta_pct: float | None, is_demo: bool,
            near_m: float | None = None) -> str:
    """Frase curta, para quem não é especialista, explicando o que mudou."""
    when = f"Entre {date_label(before['date'])} e {date_label(after['date'])}"
    a, b = before["water_area_km2"], after["water_area_km2"]

    if a == 0 and b > 0:
        # Evento NISAR: a cena de antes é a referência e a de depois traz só a água nova
        text = f"{when}, o radar NISAR detectou {_km2(b)} km² de água nova no {region['name']}, fora do leito do rio."
        if after["cidades_atingidas"]:
            text += (f" Ela chegou a menos de {_km2(near_m / 1000)} km do centro de "
                     f"{_join(after['cidades_atingidas'])}." if near_m else
                     f" A água passou a chegar às áreas urbanas de {_join(after['cidades_atingidas'])}.")
        return text + (" (Valores ilustrativos, não são medições do NISAR.)" if is_demo else "")
    if delta_pct is None or abs(delta_pct) < 10:
        text = f"{when}, a área coberta por água no {region['name']} ficou praticamente igual (cerca de {_km2(b)} km²)."
    elif delta_pct > 0:
        text = (f"{when}, a área coberta por água no {region['name']} aumentou de {_km2(a)} km² "
                f"para {_km2(b)} km², ou {delta_pct:.0f}% a mais: {_rise_text(after['status'])}.")
    else:
        text = (f"{when}, a área coberta por água no {region['name']} diminuiu de {_km2(a)} km² "
                f"para {_km2(b)} km², ou {abs(delta_pct):.0f}% a menos: {_fall_text(after['status'])}.")

    new_cities = [c for c in after["cidades_atingidas"] if c not in before["cidades_atingidas"]]
    freed_cities = [c for c in before["cidades_atingidas"] if c not in after["cidades_atingidas"]]
    if new_cities:
        text += f" A água passou a chegar às áreas urbanas de {_join(new_cities)}."
    elif after["cidades_atingidas"]:
        text += f" A água segue chegando às áreas urbanas de {_join(after['cidades_atingidas'])}."
    elif freed_cities:
        text += f" A água deixou as áreas urbanas de {_join(freed_cities)}."

    if is_demo:
        text += " (Valores ilustrativos, não são medições do NISAR.)"
    return text


def timeline_csv(data: dict) -> str:
    """CSV da linha do tempo para o governo. A coluna "fonte" diz se o dado é demo."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["data", "area_km2", "anomalia_pct", "status", "oni", "fase_enso", "fonte"])
    for p in data["series"]:
        writer.writerow([p["date"], p["water_area_km2"], p["anomaly_pct"], p["status"],
                         "" if p["oni"] is None else p["oni"], p["enso_phase"] or "", p["source"]])
    return out.getvalue()
