"""Interface das fontes de mancha d'água.

Os endpoints só conversam com um WaterProvider. Hoje existe o DemoProvider;
o NisarProvider vai implementar os mesmos dois métodos com dado real, e os
endpoints não precisam mudar.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass

from shapely.geometry.base import BaseGeometry


@dataclass
class WaterMask:
    date: str  # YYYY-MM
    geometry: BaseGeometry  # em lon/lat (WGS84)
    source: str  # "demo", "nisar"...
    note: str | None = None
    event: str | None = None


class WaterProvider(ABC):
    source: str

    @abstractmethod
    def water_mask(self, region: dict, month: str) -> WaterMask:
        """Mancha d'água da região naquele mês (YYYY-MM)."""

    @abstractmethod
    def baseline(self, region: dict) -> WaterMask:
        """Mancha de referência ("normal"), usada para calcular a anomalia."""
