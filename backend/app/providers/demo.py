import math
from functools import lru_cache

from app.data.demo_water import BASE_HALF_WIDTH_M, DEMO_DATA, DEMO_NOTE
from app.data.regions import REGIONS
from app.providers.base import WaterMask, WaterProvider
from app.services import geo


def demo_level(region_id: str, month: str) -> float:
    """Nível do rio no mês: da tabela demo ou, fora dela, um ciclo sazonal suave (pico em agosto)."""
    data = DEMO_DATA.get(region_id, {})
    level = data.get("levels", {}).get(month)
    if level is not None:
        return level
    month_number = int(month[5:7])
    return round(1 + 0.12 * math.cos(2 * math.pi * (month_number - 8) / 12), 2)


@lru_cache(maxsize=256)
def _river_buffer(region_id: str, half_width_m: float):
    region = REGIONS[region_id]
    return geo.buffer_line(region["river"]["coordinates"], half_width_m, region)


class DemoProvider(WaterProvider):
    """Mancha = traçado do rio com buffer proporcional ao nível demo do mês."""

    source = "demo"

    def water_mask(self, region: dict, month: str) -> WaterMask:
        month = month[:7]  # o demo não tem dia: um dia vira o mês dele
        level = demo_level(region["id"], month)
        event = DEMO_DATA.get(region["id"], {}).get("events", {}).get(month)
        geometry = _river_buffer(region["id"], BASE_HALF_WIDTH_M * level)
        return WaterMask(date=month, geometry=geometry, source=self.source, note=DEMO_NOTE, event=event)

    def baseline(self, region: dict) -> WaterMask:
        geometry = _river_buffer(region["id"], BASE_HALF_WIDTH_M)
        return WaterMask(date="normal", geometry=geometry, source=self.source, note=DEMO_NOTE)
