import csv
import io

from tests.conftest import auth_header, login, register
from tests.passes_fixture import fotos_dir  # noqa: F401  (fixture)

BASE = "/api/regions/vale-do-taquari"
USER = {"email": "ana@exemplo.com", "password": "senha123"}


def _logged_in(client):
    """Um usuário logado com cidade: nada disso pode aparecer na exportação."""
    register(client, city="Lajeado", **USER)
    return auth_header(login(client, **USER).json()["access_token"])


def test_exporta_csv_uma_linha_por_passagem(client, fotos_dir):
    r = client.get(f"{BASE}/export", params={"format": "csv", "month": "2026-07"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="water-waltz_vale-do-taquari_nisar_2026-07.csv"' in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert [row["n"] for row in rows] == ["2", "3"]
    assert list(rows[0]) == ["n", "date", "track", "polarization", "water_km2", "flood_km2", "dry_km2",
                             "in_flood_window", "granule", "source"]
    assert rows[0]["source"] == "nisar"


def test_exporta_json_com_procedencia_e_municipios(client, fotos_dir):
    data = client.get(f"{BASE}/export", params={"format": "json", "month": "2026-07"}).json()
    assert data["source"] == "nisar" and data["month"] == "2026-07"
    assert data["provenance"]["crs"] == "EPSG:4326"
    assert [g["n"] for g in data["provenance"]["granules"]] == [2, 3]
    assert len(data["passes"]) == 2 and "images" not in data["passes"][0]
    assert any(m["name"] == "Lajeado" and m["flood_km2"] > 0 for m in data["municipalities"])
    # Sem mês: todas as passagens, sem tabela por município
    todas = client.get(f"{BASE}/export").json()
    assert len(todas["passes"]) == 3 and todas["municipalities"] is None


def test_exporta_geojson(client, fotos_dir):
    r = client.get(f"{BASE}/export", params={"format": "geojson"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/geo+json")
    data = r.json()
    assert data["source"] == "nisar" and len(data["features"]) == 2
    assert {f["properties"]["class"] for f in data["features"]} == {"cheia", "seca"}


def test_exportacao_nao_tem_dado_de_usuario(client, fotos_dir):
    headers = _logged_in(client)
    for fmt in ("json", "csv", "geojson"):
        r = client.get(f"{BASE}/export", params={"format": fmt, "month": "2026-07"}, headers=headers)
        assert r.status_code == 200
        body = r.text.lower()
        for leak in ("ana@exemplo.com", "senha123", "bearer", "access_token", headers["Authorization"][7:].lower()):
            assert leak not in body
    # E não precisa de login
    assert client.get(f"{BASE}/export", params={"format": "csv"}).status_code == 200


def test_formato_invalido(client, fotos_dir):
    assert client.get(f"{BASE}/export", params={"format": "xlsx"}).status_code == 422
