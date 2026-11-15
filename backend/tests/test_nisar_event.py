"""Evento NISAR da equipe (app/data/nisar/taquari/), rotas /event e /passes, e datas por dia."""

from pathlib import Path

import httpx
import pytest

from app.config import settings
from app.services import enso

BASE = "/api/regions/vale-do-taquari"
REAL_NISAR = Path(__file__).resolve().parents[1] / "app" / "data" / "nisar"


@pytest.fixture
def evento(monkeypatch):
    """Usa os arquivos reais do evento copiados do frontend (o conftest aponta para uma pasta vazia)."""
    monkeypatch.setattr(settings, "nisar_dir", str(REAL_NISAR))
    enso.clear_cache()
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(lambda r: httpx.Response(503)))
    yield
    enso.clear_cache()


# --- /event ---

def test_evento(client, evento):
    r = client.get(f"{BASE}/event")
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "nisar"
    assert data["region_id"] == "vale-do-taquari"
    assert (data["data_antes"], data["data_depois"]) == ("2026-07-11", "2026-07-23")
    assert data["area_alagada_km2"] == 4.2
    assert data["agua_antes_km2"] < data["agua_depois_km2"]
    assert data["poligonos"] == 134
    assert data["arquivos"]["vetor"] == "area_alagada.geojson"
    assert "não um mapa validado" in data["note"]


def test_evento_sem_arquivos(client):
    r = client.get(f"{BASE}/event")
    assert r.status_code == 404
    assert r.json()["detail"] == "Nenhum evento NISAR processado para esta região"
    assert client.get("/api/regions/atlantida/event").status_code == 404


# --- /passes ---

def test_passagens(client, evento):
    data = client.get(f"{BASE}/passes").json()
    assert data["source"] == "nisar"
    assert data["count"] == len(data["passagens"]) == 19
    assert len(data["puladas"]) == 9
    first = data["passagens"][0]
    assert first["data"] == "2026-06-17" and first["trilha"] == "053_D_103" and first["orbita"] == "descendente"
    assert {p["trilha"] for p in data["passagens"]} == {"053_D_103", "103_A_163"}
    assert "mesma trilha" in data["note"]


def test_passagens_sem_arquivos(client):
    r = client.get(f"{BASE}/passes")
    assert r.status_code == 404
    assert r.json()["detail"] == "Nenhuma passagem NISAR catalogada para esta região"


# --- datas por dia ---

def test_water_mask_por_dia_usa_o_evento(client, evento):
    after = client.get(f"{BASE}/water-mask?date=2026-07-23").json()
    props = after["features"][0]["properties"]
    assert after["source"] == props["source"] == "nisar"
    assert after["date"] == props["date"] == "2026-07-23"
    assert props["water_area_km2"] == pytest.approx(4.2, abs=0.1)
    assert "Água NOVA" in after["note"]

    before = client.get(f"{BASE}/water-mask?date=2026-07-11").json()
    assert before["source"] == "nisar"
    assert before["features"][0]["properties"]["water_area_km2"] == 0
    assert before["features"][0]["properties"]["cidades_atingidas"] == []


def test_dia_sem_passagem_vira_o_mes(client, evento):
    data = client.get(f"{BASE}/water-mask?date=2026-07-15").json()
    assert data["date"] == "2026-07"
    assert data["source"] == "demo"


def test_mes_continua_funcionando(client, evento):
    assert client.get(f"{BASE}/water-mask?date=2026-07").json()["date"] == "2026-07"
    old = client.get(f"{BASE}/water-mask?date=2023-05-10").json()
    assert old["source"] == "demo" and old["date"] == "2023-05"


def test_compare_do_evento(client, evento):
    data = client.get(f"{BASE}/compare?before=2026-07-11&after=2026-07-23").json()
    assert data["source"] == "nisar"
    assert data["before"]["date"] == "2026-07-11" and data["after"]["date"] == "2026-07-23"
    assert data["delta_km2"] == pytest.approx(4.2, abs=0.1)
    # Cidades a até 1,2 km da água nova real
    assert data["cidades_atingidas"] == ["Muçum", "Encantado", "Roca Sales", "Arroio do Meio", "Lajeado", "Estrela"]
    assert "água nova" in data["summary"] and "11 de julho de 2026" in data["summary"]
    assert "ilustrativos" not in data["summary"]


def test_timeline_por_dia_lista_as_passagens(client, evento):
    data = client.get(f"{BASE}/timeline?start=2026-07-01&end=2026-07-31").json()
    assert data["source"] == "nisar"
    assert data["baseline_km2"] is None
    dates = [p["date"] for p in data["series"]]
    assert dates == ["2026-07-03", "2026-07-11", "2026-07-15", "2026-07-23", "2026-07-27"]
    assert all(p["source"] == "nisar" and p["track"] for p in data["series"])

    # Mês no início e dia no fim também vira série por dia
    mixed = client.get(f"{BASE}/timeline?start=2026-07&end=2026-07-11").json()
    assert [p["date"] for p in mixed["series"]] == ["2026-07-03", "2026-07-11"]


def test_timeline_mensal_nao_ganha_trilha(client, evento):
    point = client.get(f"{BASE}/timeline?start=2026-07&end=2026-07").json()["series"][0]
    assert "track" not in point


def test_frames_por_dia(client, evento):
    data = client.get(f"{BASE}/water-mask/frames?start=2026-07-01&end=2026-07-31").json()
    assert [(f["date"], f["source"]) for f in data["frames"]] == [("2026-07-11", "nisar"), ("2026-07-23", "nisar")]
    assert data["source"] == "nisar"


@pytest.mark.parametrize("query, detail", [
    ("date=2026-02-30", "Data inválida em 'date': use o formato AAAA-MM-DD (ex.: 2026-07-23) ou AAAA-MM"),
    ("date=2026-7-01x", "Data inválida em 'date': use o formato AAAA-MM-DD (ex.: 2026-07-23) ou AAAA-MM"),
    ("date=2999-01-01", "A data em 'date' está no futuro"),
])
def test_dia_invalido(client, query, detail):
    r = client.get(f"{BASE}/water-mask?{query}")
    assert r.status_code == 422
    assert r.json()["detail"] == detail


def test_intervalo_por_dia_invertido(client):
    r = client.get(f"{BASE}/timeline?start=2026-07-23&end=2026-07-11")
    assert r.status_code == 422
    assert r.json()["detail"] == "'end' deve ser depois de 'start'"
    # Mesmo mês, dia no início: o mês do fim inclui o dia, então é válido
    assert client.get(f"{BASE}/timeline?start=2026-07-15&end=2026-07").status_code == 200
