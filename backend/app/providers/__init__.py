from app.providers.base import WaterMask, WaterProvider
from app.providers.demo import DemoProvider
from app.providers.nisar import NisarProvider

__all__ = ["DemoProvider", "NisarProvider", "WaterMask", "WaterProvider", "get_provider"]


def get_provider(region_id: str) -> WaterProvider:
    """Fonte de mancha d'água da região: NISAR real quando houver cena processada, senão demo."""
    return NisarProvider()
