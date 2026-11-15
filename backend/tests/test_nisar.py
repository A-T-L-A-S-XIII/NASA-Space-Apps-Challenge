"""Rotas do Vale do Taquari sobre as passagens NISAR reais (Fotos/nisar_taquari_50)."""

import pytest

from app.services import contexto
from app.services.nisar import area_km2, contains


def test_passagens_de_julho(client):
    r = client.get("/api/nisar/passagens", params={"mes": "2026-07"})
    assert r.status_code == 200
    body = r.json()
    assert [p["data"] for p in body["itens"]] == ["2026-07-03", "2026-07-11", "2026-07-15", "2026-07-23", "2026-07-27"]
    assert body["itens"][0]["imagens"]["radar"].endswith("/imagem/radar")
    assert "2026-07" in body["meses"]


def test_resumo_julho_usa_o_catalogo(client):
    body = client.get("/api/nisar/resumo", params={"mes": "2026-07"}).json()
    assert body["passagens"] == 5
    assert body["cheia_km2"] == 0.2  # só 23/07 teve cheia no catálogo
    assert body["pico"]["data"] == "2026-07-23"
    assert body["nivel"] == "normal"
    assert "julho de 2026" in body["frase"]
    trilhas = {t["trilha"]: t for t in body["por_trilha"]}
    assert trilhas["103_A_163"]["agua_max_km2"] == 8.5


def test_resumo_mes_sem_passagens(client):
    body = client.get("/api/nisar/resumo", params={"mes": "2025-01"}).json()
    assert body["passagens"] == 0 and body["nivel"] == "sem_dados"


def test_mes_invalido(client):
    assert client.get("/api/nisar/resumo", params={"mes": "julho"}).status_code == 422


def test_geojson_da_passagem_soma_perto_do_catalogo(client):
    fc = client.get("/api/nisar/passagens/7/geojson").json()
    cheia = sum(f["properties"]["area_km2"] for f in fc["features"] if f["properties"]["classe"] == "cheia")
    assert abs(cheia - 0.2) < 0.1
    assert all(f["properties"]["data"] == "2026-07-23" for f in fc["features"])


def test_geojson_download_tem_nome_de_arquivo(client):
    r = client.get("/api/nisar/geojson", params={"mes": "2026-07", "download": True})
    assert r.status_code == 200
    assert "nisar_taquari_2026-07.geojson" in r.headers["content-disposition"]


def test_por_municipio(client):
    body = client.get("/api/nisar/municipios", params={"mes": "2026-07"}).json()
    nomes = {m["nome"] for m in body["municipios"]}
    assert {"Lajeado", "Muçum", "Encantado"} <= nomes
    total = sum(m["cheia_km2"] for m in body["municipios"]) + body["fora_dos_municipios"]["cheia_km2"]
    assert abs(total - 0.2) < 0.1
    assert body["municipios"][0]["cheia_km2"] >= body["municipios"][-1]["cheia_km2"]


def test_metadados_e_vegetacao(client):
    meta = client.get("/api/nisar/metadados").json()
    assert meta["polarizacao"] == ["HH"]
    assert meta["periodo"]["passagens"] == 19
    assert meta["vegetacao_alagada"]["disponivel"] is False
    assert client.get("/api/nisar/vegetacao-alagada").status_code == 501


def test_exportar_csv_e_json(client):
    r = client.get("/api/nisar/exportar", params={"formato": "csv", "mes": "2026-07"})
    assert r.status_code == 200 and r.text.splitlines()[0].startswith("n,data,trilha")
    assert len(r.text.strip().splitlines()) == 6
    j = client.get("/api/nisar/exportar", params={"formato": "json", "mes": "2026-07"}).json()
    assert len(j["passagens"]) == 5 and j["municipios"]


def test_imagem_radar(client):
    r = client.get("/api/nisar/passagens/4/imagem/radar")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert client.get("/api/nisar/passagens/99/imagem/radar").status_code == 404


def test_previsao_usa_open_meteo(client, monkeypatch):
    async def fake(lat, lon, dias=7):
        return {"frase": "ok", "dias": [], "lat": lat, "lon": lon}
    monkeypatch.setattr(contexto, "previsao", fake)
    body = client.get("/api/previsao").json()
    assert body["lat"] == -29.42 and body["lon"] == -51.93


def test_previsao_erro_externo_vira_502(client, monkeypatch):
    async def falha(lat, lon, dias=7):
        raise contexto.ExternalError("fora do ar")
    monkeypatch.setattr(contexto, "previsao", falha)
    assert client.get("/api/previsao").status_code == 502


def test_lugares_municipio_local_sem_rede(client, monkeypatch):
    async def sem_rede(q):
        raise contexto.ExternalError("sem rede")
    monkeypatch.setattr(contexto, "_nominatim", sem_rede)
    body = client.get("/api/lugares", params={"q": "lajea"}).json()
    assert body["itens"][0]["nome"] == "Lajeado"
    assert body["itens"][0]["dentro_da_area_coberta"] is True
    assert body["erro_bairros"]


@pytest.mark.parametrize("pt,esperado", [((0.5, 0.5), True), ((1.5, 0.5), False)])
def test_geometria(pt, esperado):
    quad = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    assert contains(quad, *pt) is esperado
    assert 12000 < area_km2(quad) < 12500
