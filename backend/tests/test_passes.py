from app.config import settings
from tests.passes_fixture import fotos_dir  # noqa: F401  (fixture)

BASE = "/api/regions/vale-do-taquari"


def test_passes_lista_com_imagens_e_cobertura(client, fotos_dir):
    r = client.get(f"{BASE}/passes")
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "nisar"
    assert data["count"] == 3 and data["months"] == ["2026-06", "2026-07"]
    assert data["coverage"] == [-52.15, -29.55, -51.8, -29.15]
    p = data["passes"][1]
    assert p["n"] == 2 and p["date"] == "2026-07-11" and p["track"] == "053_D_103"
    assert p["flood_km2"] == 0.05 and p["dry_km2"] == 0.04 and p["in_flood_window"] is True
    assert p["images"] == {"radar": "/api/static/nisar/img_02_2026-07-11/miniatura.png",
                           "slide": "/api/static/nisar/img_02_2026-07-11/slide.png"}
    assert p["geojson_url"] == f"{BASE}/passes/2/geojson"
    # Passagem sem imagens: URL nula, nada quebrado
    assert data["passes"][2]["images"] == {"radar": None, "slide": None}


def test_passes_filtra_por_mes(client, fotos_dir):
    data = client.get(f"{BASE}/passes", params={"month": "2026-07"}).json()
    assert data["month"] == "2026-07" and [p["n"] for p in data["passes"]] == [2, 3]
    assert client.get(f"{BASE}/passes", params={"month": "julho"}).status_code == 422


def test_passes_sem_catalogo_ou_outra_regiao_responde_404(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "nisar_fotos_dir", str(tmp_path / "nao-existe"))
    assert client.get(f"{BASE}/passes").status_code == 404
    assert client.get("/api/regions/nao-existe/passes").status_code == 404


def test_geojson_da_passagem_tem_classe_e_area_em_utm(client, fotos_dir):
    r = client.get(f"{BASE}/passes/2/geojson")
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "nisar" and data["date"] == "2026-07-11"
    classes = [f["properties"]["class"] for f in data["features"]]
    assert classes == ["cheia", "seca"]  # a classe desconhecida fica de fora
    area = data["features"][0]["properties"]["area_km2"]
    assert 0.03 < area < 0.06  # ~194 m x ~222 m
    assert client.get(f"{BASE}/passes/99/geojson").status_code == 404


def test_imagem_estatica_so_das_pastas_de_passagem(client, fotos_dir):
    r = client.get("/api/static/nisar/img_02_2026-07-11/miniatura.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert client.get("/api/static/nisar/img_02_2026-07-11/slide.png").status_code == 200
    # Outros arquivos da pasta e da raiz não são servidos
    assert client.get("/api/static/nisar/img_02_2026-07-11/dados.json").status_code == 404
    assert client.get("/api/static/nisar/catalogo.csv/miniatura.png").status_code == 404
    assert client.get("/api/static/nisar/..%2F..%2Fetc/miniatura.png").status_code == 404
    assert client.get("/api/static/nisar/img_03_2026-07-23/miniatura.png").status_code == 404
