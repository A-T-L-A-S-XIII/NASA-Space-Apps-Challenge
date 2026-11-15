"""Linha do tempo, mancha d'água e comparação antes/depois.

Tudo aqui é independente da fonte: os dados vêm de um WaterProvider
(app/providers) e o ONI vem da NOAA (app/services/enso.py).
"""

import asyncio
import csv
import io
from datetime import date, datetime, timedelta, timezone

from app.data.regions import bbox_to_wkt
from app.providers import WaterMask, WaterProvider
from app.services import asf, enso, geo

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
    return f"{MONTH_NAMES[int(month[5:]) - 1]} de {month[:4]}"


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
    anomaly = (area / baseline_km2 - 1) * 100
    return {
        "date": mask.date,
        "water_area_km2": round(area, 2),
        "anomaly_pct": round(anomaly, 1),
        "status": classify_status(anomaly),
        "event": mask.event,
        "source": mask.source,
    }


def _baseline_km2(provider: WaterProvider, region: dict) -> float:
    return geo.area_km2(provider.baseline(region).geometry, region)


async def timeline(provider: WaterProvider, region: dict, start: str, end: str) -> dict:
    baseline_km2 = _baseline_km2(provider, region)
    climate = await enso.get_enso()
    oni_by_month = enso.by_month(climate)

    series, notes = [], set()
    for month in month_range(start, end):
        mask = provider.water_mask(region, month)
        if mask.note:
            notes.add(mask.note)
        oni = oni_by_month.get(month)
        series.append({
            **_stats(mask, baseline_km2, region),
            "oni": oni["oni"] if oni else None,
            "enso_phase": oni["phase"] if oni else None,
        })

    return {
        "region_id": region["id"],
        "source": provider.source,
        "note": " ".join(sorted(notes)) or None,
        "start": start,
        "end": end,
        "baseline_km2": round(baseline_km2, 2),
        "enso": {"live": climate["live"], "source": climate["source"], "error": climate["error"],
                 "snapshot_date": climate.get("snapshot_date")},
        "series": series,
    }


def water_mask_geojson(provider: WaterProvider, region: dict, month: str) -> dict:
    mask = provider.water_mask(region, month)
    properties = {
        **_stats(mask, _baseline_km2(provider, region), region),
        "cidades_atingidas": geo.affected_cities(mask.geometry, region),
        "note": mask.note,
    }
    return {
        "type": "FeatureCollection",
        "region_id": region["id"],
        "date": month,
        "source": mask.source,
        "note": mask.note,
        "features": [{"type": "Feature", "geometry": geo.to_geojson(mask.geometry), "properties": properties}],
    }


def frames(provider: WaterProvider, region: dict, start: str, end: str) -> dict:
    """Todas as manchas de start a end, com geometria simplificada, para a linha do tempo animada."""
    baseline_km2 = _baseline_km2(provider, region)
    items, notes, sources = [], set(), set()
    for month in month_range(start, end):
        mask = provider.water_mask(region, month)
        stats = _stats(mask, baseline_km2, region)
        notes.add(mask.note)
        sources.add(mask.source)
        items.append({
            "date": month,
            "status": stats["status"],
            "water_area_km2": stats["water_area_km2"],
            "source": mask.source,
            "geojson": geo.simplified_geojson(mask.geometry, region),
        })
    return {
        "region_id": region["id"],
        "source": "demo" if "demo" in sources else (sources.pop() if sources else provider.source),
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
    """Cena NISAR com imagem (browse) mais perto do dia 15 do mês, ou None."""
    target = datetime(int(month[:4]), int(month[5:]), 15, tzinfo=timezone.utc)
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
    sides = {}
    for key, month in [("before", before), ("after", after)]:
        collection = water_mask_geojson(provider, region, month)
        props = collection["features"][0]["properties"]
        sides[key] = {
            "date": month,
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
        "summary": summary(region, sides["before"], sides["after"], delta_pct, "demo" in sources),
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


def summary(region: dict, before: dict, after: dict, delta_pct: float | None, is_demo: bool) -> str:
    """Frase curta, para quem não é especialista, explicando o que mudou."""
    when = f"Entre {month_label(before['date'])} e {month_label(after['date'])}"
    a, b = before["water_area_km2"], after["water_area_km2"]

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
