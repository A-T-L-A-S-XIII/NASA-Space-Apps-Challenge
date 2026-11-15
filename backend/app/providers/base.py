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
    date: str  # YYYY-MM, ou YYYY-MM-DD quando a mancha é de uma passagem específica
    geometry: BaseGeometry  # em lon/lat (WGS84)
    source: str  # "demo", "nisar"...
    note: str | None = None
    event: str | None = None
    scene: dict | None = None  # metadados da cena NISAR processada, quando houver
    anomaly_pct: float | None = None  # quando vem pronta do dado (evento NISAR), em vez da conta com a referência
    near_cities_m: float | None = None  # se definido, cidade atingida = água a até esta distância do centro


class WaterProvider(ABC):
    source: str

    @abstractmethod
    def water_mask(self, region: dict, month: str) -> WaterMask:
        """Mancha d'água da região naquele mês (YYYY-MM) ou dia (YYYY-MM-DD)."""

    @abstractmethod
    def baseline(self, region: dict) -> WaterMask:
        """Mancha de referência ("normal"), usada para calcular a anomalia."""

    def baseline_for(self, region: dict, mask: WaterMask) -> WaterMask:
        """Referência para uma mancha específica. Por padrão, a mesma para todos os meses."""
        return self.baseline(region)

    def days(self, region: dict, start: str, end: str) -> list[str]:
        """Dias (YYYY-MM-DD) entre start e end com mancha de uma passagem real. Por padrão, nenhum."""
        return []
