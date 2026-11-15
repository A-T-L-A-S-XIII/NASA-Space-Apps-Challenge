"""Contas geográficas: buffer em metros, área em km² e cidades atingidas.

Graus não servem para medir área, então convertemos para UTM (metros),
calculamos e voltamos para lon/lat (WGS84) na hora de responder.
"""

from functools import lru_cache

import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, mapping

# Uma cidade conta como "atingida" quando a mancha cobre pelo menos esta
# fração de um círculo em volta do centro (aproximação do núcleo urbano).
CITY_RADIUS_M = 1000
CITY_HIT_FRACTION = 0.3


def utm_epsg(region: dict) -> int:
    """Código EPSG da zona UTM (WGS84) que contém o centro da região."""
    lat, lon = region["center"]
    zone = int((lon + 180) // 6) + 1
    return (32700 if lat < 0 else 32600) + zone


@lru_cache
def _transformers(epsg: int) -> tuple[Transformer, Transformer]:
    to_metric = Transformer.from_crs(4326, epsg, always_xy=True)
    to_lonlat = Transformer.from_crs(epsg, 4326, always_xy=True)
    return to_metric, to_lonlat


def to_metric(geom, region):
    return shapely.transform(geom, _transformers(utm_epsg(region))[0].transform, interleaved=False)


def to_lonlat(geom, region):
    return shapely.transform(geom, _transformers(utm_epsg(region))[1].transform, interleaved=False)


def buffer_line(coords: list[list[float]], half_width_m: float, region: dict):
    """Faixa de half_width_m metros para cada lado de uma linha [lon, lat]. Devolve em lon/lat."""
    line = to_metric(LineString(coords), region)
    return to_lonlat(line.buffer(half_width_m), region)


def area_km2(geom, region: dict) -> float:
    return to_metric(geom, region).area / 1_000_000


def affected_cities(geom, region: dict) -> list[str]:
    """Cidades cujo núcleo urbano está coberto pela mancha d'água (na ordem da região)."""
    water = to_metric(geom, region)
    names = []
    for city in region["cities"]:
        core = to_metric(Point(city["lon"], city["lat"]), region).buffer(CITY_RADIUS_M)
        if water.intersection(core).area >= CITY_HIT_FRACTION * core.area:
            names.append(city["name"])
    return names


def to_geojson(geom) -> dict:
    """Geometria GeoJSON com coordenadas arredondadas (~1 m) para a resposta ficar leve."""
    return mapping(shapely.set_precision(geom, 1e-5))
