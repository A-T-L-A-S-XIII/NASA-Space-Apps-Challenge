from app.config import settings
from tests.passes_fixture import fotos_dir  # noqa: F401  (fixture)

BASE = "/api/regions/vale-do-taquari"


def test_area_por_municipio_pelo_centroide(client, fotos_dir):
    r = client.get(f"{BASE}/municipalities", params={"month": "2026-07"})
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "nisar" and data["mesh_source"] == "ibge"
    assert data["dates"] == ["2026-07-11", "2026-07-23"]
    by_name = {m["name"]: m for m in data["municipalities"]}
    lajeado, encantado = by_name["Lajeado"], by_name["Encantado"]
    assert 0.03 < lajeado["flood_km2"] < 0.06 and lajeado["dry_km2"] == 0
    assert 0.03 < encantado["dry_km2"] < 0.06 and encantado["flood_km2"] == 0
    assert lajeado["per_date"][0]["date"] == "2026-07-11" and lajeado["per_date"][0]["flood_km2"] > 0
    assert lajeado["touches_coverage"] is True
    # Mais cheia primeiro
    assert data["municipalities"][0]["name"] == "Lajeado"
    assert data["outside_municipalities"] == {"flood_km2": 0.0, "dry_km2": 0.0}


def test_area_por_municipio_exige_mes(client, fotos_dir):
    assert client.get(f"{BASE}/municipalities").status_code == 422


def test_mes_sem_passagem_zera_tudo(client, fotos_dir):
    data = client.get(f"{BASE}/municipalities", params={"month": "2025-01"}).json()
    assert data["dates"] == []
    assert all(m["flood_km2"] == 0 and m["dry_km2"] == 0 for m in data["municipalities"])


def test_malha_municipal(client):
    r = client.get(f"{BASE}/municipalities/geojson")
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "ibge" and data["type"] == "FeatureCollection"
    assert {"Lajeado", "Estrela", "Muçum"} <= {f["properties"]["name"] for f in data["features"]}


def test_sem_malha_responde_404(client, fotos_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "municipalities_file", str(tmp_path / "nao-existe.geojson"))
    assert client.get(f"{BASE}/municipalities/geojson").status_code == 404
    assert client.get(f"{BASE}/municipalities", params={"month": "2026-07"}).status_code == 404
