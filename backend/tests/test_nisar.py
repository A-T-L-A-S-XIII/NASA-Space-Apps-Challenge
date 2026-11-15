import json

import httpx
import pytest
from shapely.geometry import box, mapping

from app.config import settings
from app.data.regions import REGIONS
from app.services import enso, geo

BASE = "/api/regions/vale-do-taquari"
TAQUARI = REGIONS["vale-do-taquari"]
# Caixa de ~2 km em volta de Muçum: cobre o núcleo urbano da cidade
MUCUM_BOX = box(-51.885, -29.180, -51.853, -29.150)


def write_scene(folder, date, geometry, track="103_A_163", **extra):
    meta = {
        "source": "nisar", "region_id": "vale-do-taquari",
        "granule": f"NISAR_L2_PR_GCOV_034_{track}_4005_DHDH_A_{date.replace('-', '')}T092224_X_001",
        "date": date, "acquisition_time": f"{date}T09:22:24Z", "track": track, "flight_direction": "ASCENDING",
        "polarization": "HH", "method": "fixed", "threshold_db": -18.0,
        "water_area_km2": round(geo.area_km2(geometry, TAQUARI), 2), "valid_fraction": 0.98,
        "scene_coverage": 0.9, "pixel_size_m": 20.0, "min_area_m2": 10000, "bbox": TAQUARI["bbox"],
        "url": "https://exemplo.test/cena.h5", "processed_at": "2026-11-15T08:00:00+00:00", **extra,
    }
    data = {"type": "FeatureCollection", "metadata": meta,
            "features": [{"type": "Feature", "geometry": mapping(geometry), "properties": meta}]}
    (folder / f"vale-do-taquari_{date}.geojson").write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def nisar_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "nisar_dir", str(tmp_path))
    enso.clear_cache()
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(lambda r: httpx.Response(503)))
    yield tmp_path
    enso.clear_cache()


def test_sem_cenas_processadas(client, nisar_dir):
    assert client.get(f"{BASE}/nisar-processed").json() == {"region_id": "vale-do-taquari", "count": 0, "scenes": []}
    assert client.get(f"{BASE}/water-mask?date=2026-10").json()["source"] == "demo"
    assert client.get("/api/regions/atlantida/nisar-processed").status_code == 404


def test_lista_cenas_processadas(client, nisar_dir):
    write_scene(nisar_dir, "2026-10-19", MUCUM_BOX)
    write_scene(nisar_dir, "2026-10-31", MUCUM_BOX)
    (nisar_dir / "vale-do-taquari_2026-09-01.geojson").write_text("{quebrado", encoding="utf-8")
    data = client.get(f"{BASE}/nisar-processed").json()
    assert data["count"] == 2  # o arquivo quebrado é ignorado
    assert [s["date"] for s in data["scenes"]] == ["2026-10-31", "2026-10-19"]
    scene = data["scenes"][0]
    assert scene["track"] == "103_A_163"
    assert scene["file"] == "vale-do-taquari_2026-10-31.geojson"
    assert "geometry" not in scene


def test_water_mask_usa_nisar_no_mes_processado(client, nisar_dir):
    write_scene(nisar_dir, "2026-10-31", MUCUM_BOX)
    data = client.get(f"{BASE}/water-mask?date=2026-10").json()
    props = data["features"][0]["properties"]
    assert data["source"] == props["source"] == "nisar"
    assert "Mancha real do NISAR" in data["note"] and "103_A_163" in data["note"]
    assert props["water_area_km2"] == pytest.approx(geo.area_km2(MUCUM_BOX, TAQUARI), abs=0.01)
    assert props["anomaly_pct"] == 0  # uma cena só na trilha
    assert props["status"] == "normal"
    assert props["cidades_atingidas"] == ["Muçum"]
    # Mês sem cena continua demo
    assert client.get(f"{BASE}/water-mask?date=2026-09").json()["source"] == "demo"


def test_anomalia_so_compara_a_mesma_trilha(client, nisar_dir):
    small, big = MUCUM_BOX, MUCUM_BOX.buffer(0.02)
    write_scene(nisar_dir, "2026-08-16", small)
    write_scene(nisar_dir, "2026-09-09", small)
    write_scene(nisar_dir, "2026-10-19", big)
    write_scene(nisar_dir, "2026-10-27", big.buffer(0.05), track="053_D_103")  # outra trilha, mesmo mês
    # Em outubro vale a cena mais recente (trilha 053), que é a única da trilha dela
    assert client.get(f"{BASE}/water-mask?date=2026-10").json()["features"][0]["properties"]["anomaly_pct"] == 0
    # Agosto: referência = mediana da trilha 103 (small, small, big -> small)
    aug = client.get(f"{BASE}/water-mask?date=2026-08").json()["features"][0]["properties"]
    assert aug["anomaly_pct"] == 0


def test_mancha_maior_que_a_mediana_da_trilha(client, nisar_dir):
    write_scene(nisar_dir, "2026-07-03", MUCUM_BOX)
    write_scene(nisar_dir, "2026-08-16", MUCUM_BOX)
    write_scene(nisar_dir, "2026-09-09", MUCUM_BOX.buffer(0.03))
    sep = client.get(f"{BASE}/water-mask?date=2026-09").json()["features"][0]["properties"]
    assert sep["anomaly_pct"] > 80
    assert sep["status"] == "enchente"


def test_compare_mistura_nisar_e_demo(client, nisar_dir):
    write_scene(nisar_dir, "2026-10-31", MUCUM_BOX)
    data = client.get(f"{BASE}/compare?before=2026-09&after=2026-10").json()
    assert data["after"]["geojson"]["source"] == "nisar"
    assert data["before"]["geojson"]["source"] == "demo"
    assert data["source"] == "demo"  # um dos lados é ilustrativo
    assert "ilustrativos" in data["summary"]


def test_compare_so_nisar(client, nisar_dir):
    write_scene(nisar_dir, "2026-09-09", MUCUM_BOX)
    write_scene(nisar_dir, "2026-10-19", MUCUM_BOX.buffer(0.01))
    data = client.get(f"{BASE}/compare?before=2026-09&after=2026-10").json()
    assert data["source"] == "nisar"
    assert data["delta_km2"] > 0
    assert "ilustrativos" not in data["summary"]


def test_timeline_marca_cada_mes(client, nisar_dir):
    write_scene(nisar_dir, "2026-10-31", MUCUM_BOX)
    data = client.get(f"{BASE}/timeline?start=2026-09&end=2026-10").json()
    assert [p["source"] for p in data["series"]] == ["demo", "nisar"]
    assert data["source"] == "demo"
    frames = client.get(f"{BASE}/water-mask/frames?start=2026-10&end=2026-10").json()
    assert frames["source"] == "nisar" and frames["frames"][0]["source"] == "nisar"
