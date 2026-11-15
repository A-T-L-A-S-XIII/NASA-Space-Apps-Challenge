"""Manchas d'água reais do NISAR.

Duas fontes reais, ambas com source="nisar":
- o evento processado pela equipe (app/services/nisar_event.py): nos dias das cenas de antes e depois;
- as cenas geradas por scripts/process_nisar.py: no dia da cena ou, pedindo por mês, no mês dela.
Um dia sem cena real vira o mês dele. Nos meses sem cena, delega ao DemoProvider (marcado como demo).
"""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import shape

from app.config import settings
from app.providers.base import WaterMask, WaterProvider
from app.providers.demo import DemoProvider
from app.services import nisar_event


@lru_cache(maxsize=64)
def _read(path: str, mtime: float) -> dict:
    # mtime entra na chave do cache: se o script reprocessar a cena, o arquivo é lido de novo
    return json.loads(Path(path).read_text(encoding="utf-8"))


def processed_scenes(region_id: str) -> list[dict]:
    """Metadados e geometria das cenas processadas da região, da mais antiga para a mais recente."""
    folder = Path(settings.nisar_dir)
    scenes = []
    for path in sorted(folder.glob(f"{region_id}_*.geojson")):
        try:
            data = _read(str(path), path.stat().st_mtime)
            meta = data["metadata"]
            geometry = shape(data["features"][0]["geometry"])
        except (OSError, ValueError, KeyError, IndexError):
            continue  # arquivo quebrado não derruba a API
        scenes.append({**meta, "file": path.name, "geometry": geometry})
    return sorted(scenes, key=lambda s: s["acquisition_time"])


def nisar_note(scene: dict, same_track: int) -> str:
    return (f"Mancha real do NISAR (cena de {scene['date']}, trilha {scene['track']}, {scene['polarization']}, "
            f"limiar {scene['threshold_db']} dB). Mostra a água detectada pelo radar no recorte processado, "
            f"não um mapa validado de enchente. A anomalia compara com {same_track} cena(s) processada(s) "
            f"da mesma trilha.")


class NisarProvider(WaterProvider):
    source = "nisar"

    def __init__(self):
        self.demo = DemoProvider()

    def _scene_for(self, region: dict, date: str) -> dict | None:
        """Cena processada mais recente naquele mês (YYYY-MM) ou dia (YYYY-MM-DD)."""
        found = [s for s in processed_scenes(region["id"]) if s["date"].startswith(date)]
        return found[-1] if found else None

    def _event_mask(self, region: dict, day: str) -> WaterMask | None:
        """Mancha do evento NISAR nos dias das cenas de antes e depois.

        O evento só tem os polígonos da água NOVA entre as duas cenas. Então a cena de antes é a
        referência (mancha vazia) e a de depois traz a água nova: o delta do /compare é a água nova.
        A anomalia vem da água total medida nas duas cenas (depois / antes).
        """
        event = nisar_event.load_event(region["id"])
        if event is None or day not in (event["data_antes"], event["data_depois"]):
            return None
        if day == event["data_antes"]:
            geometry, note, anomaly = nisar_event.empty_geometry(), nisar_event.before_note(event), 0.0
        else:
            geometry = nisar_event.new_water(region["id"])
            if geometry is None:
                return None
            note = nisar_event.after_note(event, nisar_event.polygon_count(region["id"]))
            anomaly = round((event["agua_depois_km2"] / event["agua_antes_km2"] - 1) * 100, 1)
        return WaterMask(date=day, geometry=geometry, source="nisar", note=note,
                         anomaly_pct=anomaly, near_cities_m=nisar_event.NEAR_CITY_M)

    def water_mask(self, region: dict, month: str) -> WaterMask:
        date = month
        if len(date) == 10:
            mask = self._event_mask(region, date)
            if mask is not None:
                return mask
        scene = self._scene_for(region, date)
        if scene is None and len(date) == 10:
            date = date[:7]  # dia sem cena real: vale o mês
            scene = self._scene_for(region, date)
        if scene is None:
            return self.demo.water_mask(region, date)
        same_track = [s for s in processed_scenes(region["id"]) if s["track"] == scene["track"]]
        return WaterMask(date=date, geometry=scene["geometry"], source="nisar",
                         note=nisar_note(scene, len(same_track)), scene=scene)

    def days(self, region: dict, start: str, end: str) -> list[str]:
        """Dias com mancha real: cenas do evento e cenas processadas."""
        found = {s["date"] for s in processed_scenes(region["id"])}
        event = nisar_event.load_event(region["id"])
        if event is not None:
            found |= {event["data_antes"], event["data_depois"]}
        return sorted(d for d in found if start <= d <= end)

    def baseline(self, region: dict) -> WaterMask:
        return self.demo.baseline(region)

    def baseline_for(self, region: dict, mask: WaterMask) -> WaterMask:
        """A mancha real só se compara com cenas reais da mesma trilha (a área muda com a órbita).

        A referência é a cena de área mediana da trilha. Com uma cena só, a anomalia fica 0.
        """
        if mask.source != "nisar" or mask.scene is None:
            return self.demo.baseline(region)
        track = mask.scene["track"]
        same = sorted((s for s in processed_scenes(region["id"]) if s["track"] == track),
                      key=lambda s: s["water_area_km2"])
        median = same[len(same) // 2]
        return WaterMask(date="normal", geometry=median["geometry"], source="nisar")
