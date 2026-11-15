"""Regiões monitoradas pelo Water Waltz.

Convenções de coordenadas:
- bbox: [lon_min, lat_min, lon_max, lat_max]
- center: [lat, lon] (formato do Leaflet)
- cities: lat e lon separados
- river: lista de pontos [lon, lat], de norte a sul (formato GeoJSON)

Para adicionar uma região nova, crie outro dicionário no mesmo formato
e inclua em REGIONS.
"""

VALE_DO_TAQUARI = {
    "id": "vale-do-taquari",
    "name": "Vale do Taquari",
    "state": "RS",
    "bbox": [-52.15, -29.85, -51.70, -29.05],
    "center": [-29.42, -51.93],
    "zoom": 10,
    "cities": [
        {"name": "Muçum", "lat": -29.165, "lon": -51.869},
        {"name": "Encantado", "lat": -29.236, "lon": -51.870},
        {"name": "Roca Sales", "lat": -29.284, "lon": -51.866},
        {"name": "Arroio do Meio", "lat": -29.401, "lon": -51.945},
        {"name": "Lajeado", "lat": -29.467, "lon": -51.961},
        {"name": "Estrela", "lat": -29.502, "lon": -51.966},
        {"name": "Bom Retiro do Sul", "lat": -29.607, "lon": -51.943},
        {"name": "Taquari", "lat": -29.800, "lon": -51.864},
    ],
    # Traçado simplificado do Rio Taquari (não é o leito exato)
    "river": {
        "name": "Rio Taquari",
        "coordinates": [
            [-51.890, -29.080],
            [-51.869, -29.165],  # Muçum
            [-51.862, -29.200],
            [-51.870, -29.236],  # Encantado
            [-51.866, -29.284],  # Roca Sales
            [-51.900, -29.340],
            [-51.945, -29.401],  # Arroio do Meio
            [-51.961, -29.467],  # Lajeado
            [-51.966, -29.502],  # Estrela
            [-51.955, -29.560],
            [-51.943, -29.607],  # Bom Retiro do Sul
            [-51.900, -29.700],
            [-51.864, -29.800],  # Taquari
            [-51.845, -29.845],
        ],
    },
}

REGIONS = {region["id"]: region for region in [VALE_DO_TAQUARI]}


def bbox_to_wkt(bbox: list[float]) -> str:
    """Converte [lon_min, lat_min, lon_max, lat_max] em POLYGON WKT (anti-horário, fechado)."""
    lon_min, lat_min, lon_max, lat_max = bbox
    points = [
        (lon_min, lat_min),
        (lon_max, lat_min),
        (lon_max, lat_max),
        (lon_min, lat_max),
        (lon_min, lat_min),
    ]
    return "POLYGON((" + ",".join(f"{lon} {lat}" for lon, lat in points) + "))"
