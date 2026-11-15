"""Manchas d'água reais do NISAR, geradas antes por scripts/process_nisar.py.

Para um mês com cena processada, devolve a mancha real com source="nisar".
Para os outros meses, delega ao DemoProvider (que continua marcado como demo).
"""

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import shape

from app.config import settings
from app.providers.base import WaterMask, WaterProvider
from app.providers.demo import DemoProvider


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

    def _scene_for(self, region: dict, month: str) -> dict | None:
        """Cena mais recente processada naquele mês."""
        in_month = [s for s in processed_scenes(region["id"]) if s["date"].startswith(month)]
        return in_month[-1] if in_month else None

    def water_mask(self, region: dict, month: str) -> WaterMask:
        scene = self._scene_for(region, month)
        if scene is None:
            return self.demo.water_mask(region, month)
        same_track = [s for s in processed_scenes(region["id"]) if s["track"] == scene["track"]]
        return WaterMask(date=month, geometry=scene["geometry"], source="nisar",
                         note=nisar_note(scene, len(same_track)), scene=scene)

    def baseline(self, region: dict) -> WaterMask:
        return self.demo.baseline(region)

    def baseline_for(self, region: dict, mask: WaterMask) -> WaterMask:
        """A mancha real só se compara com cenas reais da mesma trilha (a área muda com a órbita).

        A referência é a cena de área mediana da trilha. Com uma cena só, a anomalia fica 0.
        """
        if mask.source != "nisar":
            return self.demo.baseline(region)
        track = mask.scene["track"]
        same = sorted((s for s in processed_scenes(region["id"]) if s["track"] == track),
                      key=lambda s: s["water_area_km2"])
        median = same[len(same) // 2]
        return WaterMask(date="normal", geometry=median["geometry"], source="nisar")
