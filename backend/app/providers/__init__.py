from app.providers.base import WaterMask, WaterProvider
from app.providers.demo import DemoProvider

__all__ = ["DemoProvider", "WaterMask", "WaterProvider", "get_provider"]


def get_provider(region_id: str) -> WaterProvider:
    """Fonte de mancha d'água da região. Quando o NisarProvider existir, a troca é feita aqui."""
    return DemoProvider()
