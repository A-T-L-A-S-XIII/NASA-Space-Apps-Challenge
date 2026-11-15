"""Interface das fontes de mancha d'água.

Os endpoints só conversam com um WaterProvider. O DemoProvider gera manchas
ilustrativas; o NisarProvider usa as cenas reais processadas e cai no demo
nos meses sem cena.
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
    scene: dict | None = None  # metadados da cena NISAR processada, quando houver


class WaterProvider(ABC):
    source: str

    @abstractmethod
    def water_mask(self, region: dict, month: str) -> WaterMask:
        """Mancha d'água da região naquele mês (YYYY-MM)."""

    @abstractmethod
    def baseline(self, region: dict) -> WaterMask:
        """Mancha de referência ("normal"), usada para calcular a anomalia."""

    def baseline_for(self, region: dict, mask: WaterMask) -> WaterMask:
        """Referência para uma mancha específica. Por padrão, a mesma para todos os meses."""
        return self.baseline(region)
