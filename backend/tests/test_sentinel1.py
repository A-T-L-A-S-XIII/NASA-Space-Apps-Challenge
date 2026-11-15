import json

import pytest
from shapely.geometry import box, mapping

from app.config import settings

BASE = "/api/regions/vale-do-taquari"
# Caixa de ~2 km em volta de Muçum: cobre o núcleo urbano da cidade
MUCUM_BOX = box(-51.885, -29.180, -51.853, -29.150)
# Faixa fina perto de Lajeado: cobre só ~5% do núcleo
LAJEADO_FAIXA = box(-51.963, -29.469, -51.959, -29.465)
RIO = box(-51.90, -29.30, -51.89, -29.20)


def feature(cls, geometry, months_min, months_max, area):
    return {"type": "Feature", "geometry": mapping(geometry),
            "properties": {"class": cls, "description": f"Classe {cls}", "months_min": months_min,
                           "months_max": months_max, "area_km2": area}}


def write_recurrence(folder):
    data = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "sentinel-1", "region_id": "vale-do-taquari", "collection": "COPERNICUS/S1_GRD",
            "relative_orbit": 24, "orbit_pass": "DESCENDING", "polarization": "VV",
            "period": {"start": "2015-04-29", "end": "2026-11-10"}, "images": 471, "months_observed": 3,
            "threshold_db": -18.0, "max_slope_deg": 5.0, "permanent_fraction": 0.5, "pixel_size_m": 30.0,
            "min_area_m2": 10000, "bbox": [-52.15, -29.85, -51.7, -29.05],
            "processed_at": "2026-11-15T08:00:00+00:00",
        },
        "monthly": [
            {"month": "2023-09", "images": 3, "flooded_km2": 41.2},
            {"month": "2024-05", "images": 2, "flooded_km2": 63.5},
            {"month": "2024-06", "images": 2, "flooded_km2": 1.1},
        ],
        "features": [
            feature("recorrente", MUCUM_BOX, 4, None, 4.1),
            feature("pontual", LAJEADO_FAIXA, 1, 1, 0.5),
            feature("permanente", RIO, None, None, 10.8),
        ],
    }
    (folder / "vale-do-taquari_recorrencia.geojson").write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def sentinel1_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "sentinel1_dir", str(tmp_path))
    return tmp_path


def test_sem_historico_processado(client, sentinel1_dir):
    r = client.get(f"{BASE}/recurrence")
    assert r.status_code == 404
    assert r.json()["detail"] == "Histórico Sentinel-1 ainda não processado para esta região"
    assert client.get("/api/regions/atlantida/recurrence").json()["detail"] == "Região não encontrada"


def test_recorrencia_com_classes_cidades_e_serie(client, sentinel1_dir):
    write_recurrence(sentinel1_dir)
    body = client.get(f"{BASE}/recurrence").json()
    assert body["source"] == "sentinel-1"
    assert body["images"] == 471 and body["relative_orbit"] == 24
    assert "471 passagens" in body["note"] and "sem_registro" in body["note"]
    assert [c["class"] for c in body["classes"]] == ["recorrente", "pontual", "permanente"]
    assert [m["month"] for m in body["monthly"]] == ["2023-09", "2024-05", "2024-06"]
    assert len(body["geojson"]["features"]) == 3

    cities = {c["city_id"]: c for c in body["cities"]}
    assert cities["mucum"]["class"] == "recorrente"
    assert cities["mucum"]["flooded_share"] > 0.9
    # A faixa cobre menos de 10% do núcleo de Lajeado: não basta para dar classe
    assert cities["lajeado"]["class"] == "sem_registro"
    assert 0 < cities["lajeado"]["flooded_share"] < 0.1
    assert cities["encantado"] == {"city_id": "encantado", "name": "Encantado", "class": "sem_registro",
                                   "flooded_share": 0.0}


def test_recorrencia_sem_geometria(client, sentinel1_dir):
    write_recurrence(sentinel1_dir)
    body = client.get(f"{BASE}/recurrence?geometry=false").json()
    assert body["geojson"] is None
    assert len(body["cities"]) > 0
