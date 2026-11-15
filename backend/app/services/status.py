"""Resumo da região para o card principal do frontend."""

import asyncio
from datetime import datetime

from app.data.regions import bbox_to_wkt
from app.providers import WaterProvider
from app.services import asf, enso, geo, water

WATER_PHRASES = {
    "seca": "rio abaixo do normal, sinal de estiagem",
    "normal": "rio dentro do normal",
    "alerta": "rio acima do normal, vale acompanhar",
    "enchente": "rio fora do leito",
}

# Tendência geral da fase, sem atribuir um evento específico a ela (decisão D-F)
ENSO_PHRASES = {
    "El Niño": ", fase que em média traz mais chuva ao Sul do Brasil",
    "La Niña": ", fase ligada a menos chuva no Rio Grande do Sul",
    "Neutro": "",
}


def _number(value: float) -> str:
    return f"{value:+.1f}".replace(".", ",")


def _short_date(iso: str | None) -> str | None:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except (AttributeError, ValueError):
        return None


async def region_status(provider: WaterProvider, region: dict) -> dict:
    month = water.current_month()
    climate, scenes = await asyncio.gather(
        enso.get_enso(),
        asf.search_scenes(bbox_to_wkt(region["bbox"]), product="GCOV"),
    )

    mask = water.water_mask_geojson(provider, region, month)
    props = mask["features"][0]["properties"]
    water_info = {k: props[k] for k in ["date", "water_area_km2", "anomaly_pct", "status", "event", "source", "note"]}

    latest_oni = climate["series"][-1] if climate["series"] else None
    enso_info = {
        "live": climate["live"],
        "month": latest_oni["month"] if latest_oni else None,
        "season": latest_oni["season"] if latest_oni else None,
        "oni": latest_oni["oni"] if latest_oni else None,
        "phase": latest_oni["phase"] if latest_oni else None,
        "error": climate["error"],
        "snapshot_date": climate.get("snapshot_date"),
    }

    scene = scenes["scenes"][0] if scenes["scenes"] else None
    scene_info = {"live": scenes["live"], "scene": scene, "error": scenes["error"],
                  "snapshot_date": scenes.get("snapshot_date")}

    # Texto curto: água, clima e satélite, nessa ordem
    label = water.month_label(month)
    text = f"{label[0].upper()}{label[1:]}: {WATER_PHRASES[props['status']]}"
    text += " (valor ilustrativo)." if props["source"] == "demo" else "."
    if latest_oni:
        text += (f" Na última medição da NOAA ({latest_oni['season']} {latest_oni['year']}), o Pacífico estava em "
                 f"{latest_oni['phase']} (ONI {_number(latest_oni['oni'])}){ENSO_PHRASES[latest_oni['phase']]}.")
    scene_date = _short_date(scene["start_time"]) if scene else None
    if scene_date:
        text += f" Última passagem do NISAR sobre a região: {scene_date}."
    elif not scenes["live"]:
        text += " Não foi possível consultar as cenas do NISAR agora."
    else:
        text += " Nenhuma cena do NISAR encontrada para a região."

    return {
        "region_id": region["id"],
        "region_name": region["name"],
        "water": water_info,
        "enso": enso_info,
        "latest_scene": scene_info,
        "text": text,
    }


def city_status(provider: WaterProvider, region: dict, city: dict, alerts: list) -> dict:
    """A cidade está dentro da mancha d'água do mês mais recente? E os alertas ativos dela."""
    month = water.current_month()
    mask = provider.water_mask(region, month)
    collection = water.water_mask_geojson(provider, region, month)
    props = collection["features"][0]["properties"]
    inside = geo.city_hit(mask.geometry, city, region)

    label = water.month_label(month)
    if inside:
        text = f"Em {label}, a mancha d'água chega à área urbana de {city['name']}."
    else:
        text = f"Em {label}, a mancha d'água não chega à área urbana de {city['name']}."
    text += f" Na região, {WATER_PHRASES[props['status']]}"
    text += " (valor ilustrativo)." if props["source"] == "demo" else "."
    if alerts:
        text += f" Há {len(alerts)} alertas ativos." if len(alerts) > 1 else " Há 1 alerta ativo."

    return {
        "city_id": city["id"],
        "city_name": city["name"],
        "region_id": region["id"],
        "date": month,
        "inside_water": inside,
        "status": props["status"],
        "water_area_km2": props["water_area_km2"],
        "source": props["source"],
        "note": props["note"],
        "text": text,
        "alerts": alerts,
    }
