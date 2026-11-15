import csv
import io

import httpx
import pytest

from app import providers
from app.data.regions import city_slug, find_city
from app.providers import WaterMask, WaterProvider
from app.services import enso, geo
from tests.conftest import auth_header, login, register

ALERT = {
    "region_id": "vale-do-taquari",
    "city_id": "encantado",
    "level": "emergencia",
    "title": "Evacuação preventiva",
    "message": "Saia das áreas baixas.",
}


@pytest.fixture(autouse=True)
def noaa_fora():
    """O export e o status da cidade não dependem da NOAA; sem ela o ONI vem vazio."""
    enso.clear_cache()
    enso._transport = httpx.MockTransport(lambda r: httpx.Response(503))
    yield
    enso._transport = None
    enso.clear_cache()


def token_cidadao(client, city="Lajeado"):
    register(client, city=city)
    return login(client, "ana@exemplo.com", "senha123").json()["access_token"]


def token_gov(client):
    return login(client, "gov@teste.dev", "senha-gov-123").json()["access_token"]


# --- cidades ---

def test_ids_das_cidades():
    assert city_slug("Muçum") == "mucum"
    assert city_slug("Bom Retiro do Sul") == "bom-retiro-do-sul"
    assert find_city("  muçum ")[1]["name"] == "Muçum"
    assert find_city("lajeado")[0]["id"] == "vale-do-taquari"
    assert find_city("Porto Alegre") is None


def test_regiao_lista_cidades_com_id(client):
    cities = client.get("/api/regions/vale-do-taquari").json()["cities"]
    assert all(c["id"] == city_slug(c["name"]) for c in cities)


# --- permissões ---

def test_cidadao_recebe_403_ao_criar_alerta(client):
    r = client.post("/api/alerts", json=ALERT, headers=auth_header(token_cidadao(client)))
    assert r.status_code == 403
    assert r.json()["detail"] == "Apenas usuários do governo podem fazer isso"


def test_cidadao_recebe_403_ao_desativar_alerta(client):
    r = client.patch("/api/alerts/1", json={"active": False}, headers=auth_header(token_cidadao(client)))
    assert r.status_code == 403
    assert client.get("/api/alerts").json()[-1]["active"] is True


def test_sem_login_recebe_401_ao_criar_alerta(client):
    assert client.post("/api/alerts", json=ALERT).status_code == 401


def test_cidadao_recebe_403_no_export(client):
    r = client.get("/api/gov/export/vale-do-taquari.csv", headers=auth_header(token_cidadao(client)))
    assert r.status_code == 403
    assert client.get("/api/gov/export/vale-do-taquari.csv").status_code == 401


# --- alertas ---

def test_alertas_demo_no_startup(client):
    alerts = client.get("/api/alerts").json()
    assert len(alerts) == 2
    assert all(a["source"] == "demo" and a["title"].startswith("[Exemplo]") for a in alerts)
    assert {a["city_id"] for a in alerts} == {None, "lajeado"}


def test_governo_cria_e_desativa_alerta(client):
    headers = auth_header(token_gov(client))
    r = client.post("/api/alerts", json=ALERT, headers=headers)
    assert r.status_code == 201
    alert = r.json()
    assert alert["source"] == "governo"
    assert alert["active"] is True
    assert alert["created_by"] == 1
    assert client.get("/api/alerts").json()[0]["id"] == alert["id"]  # mais recente primeiro

    r = client.patch(f"/api/alerts/{alert['id']}", json={"active": False}, headers=headers)
    assert r.status_code == 200
    assert r.json()["active"] is False
    assert alert["id"] not in [a["id"] for a in client.get("/api/alerts").json()]


def test_created_at_volta_em_utc(client):
    """O SQLite não guarda o fuso; a API deve devolver o horário com +00:00."""
    alerts = client.get("/api/alerts").json()
    assert all(a["created_at"].endswith(("+00:00", "Z")) for a in alerts)
    me = client.get("/api/auth/me", headers=auth_header(token_gov(client))).json()
    assert me["created_at"].endswith(("+00:00", "Z"))


def test_filtro_por_cidade_inclui_alerta_da_regiao(client):
    client.post("/api/alerts", json=ALERT, headers=auth_header(token_gov(client)))
    encantado = client.get("/api/alerts?city_id=encantado").json()
    assert {a["city_id"] for a in encantado} == {"encantado", None}
    lajeado = client.get("/api/alerts?region_id=vale-do-taquari&city_id=lajeado").json()
    assert {a["city_id"] for a in lajeado} == {"lajeado", None}
    assert client.get("/api/alerts?region_id=outra-regiao").json() == []


@pytest.mark.parametrize("change, status, detail", [
    ({"region_id": "atlantida"}, 404, "Região não encontrada"),
    ({"city_id": "porto-alegre"}, 404, "Cidade não encontrada nesta região"),
    ({"level": "perigo"}, 422, "Dados inválidos"),
    ({"title": ""}, 422, "Dados inválidos"),
])
def test_criar_alerta_invalido(client, change, status, detail):
    r = client.post("/api/alerts", json={**ALERT, **change}, headers=auth_header(token_gov(client)))
    assert r.status_code == status
    assert r.json()["detail"] == detail


def test_desativar_alerta_inexistente(client):
    r = client.patch("/api/alerts/999", json={"active": False}, headers=auth_header(token_gov(client)))
    assert r.status_code == 404
    assert r.json()["detail"] == "Alerta não encontrado"


# --- export CSV ---

def test_export_csv_do_governo(client):
    r = client.get("/api/gov/export/vale-do-taquari.csv?start=2024-01&end=2024-06",
                   headers=auth_header(token_gov(client)))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "vale-do-taquari_2024-01_2024-06.csv" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert list(rows[0]) == ["data", "area_km2", "anomalia_pct", "status", "oni", "fase_enso", "fonte"]
    assert [row["data"] for row in rows] == [f"2024-0{m}" for m in range(1, 7)]
    assert rows[4]["status"] == "enchente"  # maio de 2024
    assert all(row["fonte"] == "demo" for row in rows)


def test_export_csv_parametros(client):
    headers = auth_header(token_gov(client))
    assert client.get("/api/gov/export/atlantida.csv", headers=headers).status_code == 404
    r = client.get("/api/gov/export/vale-do-taquari.csv?start=2024-13", headers=headers)
    assert r.status_code == 422


# --- status da cidade ---

def test_status_da_cidade_sem_agua(client):
    r = client.get("/api/me/city-status", headers=auth_header(token_cidadao(client, city="lajeado")))
    assert r.status_code == 200
    data = r.json()
    assert data["city_id"] == "lajeado"
    assert data["city_name"] == "Lajeado"
    assert data["inside_water"] is False  # mês atual é demo com rio normal
    assert data["source"] == "demo"
    assert "valor ilustrativo" in data["text"]
    assert {a["city_id"] for a in data["alerts"]} == {"lajeado", None}


def test_status_da_cidade_dentro_da_mancha(client, monkeypatch):
    class Enchente(WaterProvider):
        source = "fake"

        def water_mask(self, region, month):
            return WaterMask(date=month, geometry=geo.buffer_line(region["river"]["coordinates"], 3000, region),
                             source=self.source)

        def baseline(self, region):
            return WaterMask(date="normal", geometry=geo.buffer_line(region["river"]["coordinates"], 150, region),
                             source=self.source)

    monkeypatch.setattr(providers, "get_provider", lambda region_id: Enchente())
    data = client.get("/api/me/city-status", headers=auth_header(token_cidadao(client, city="Muçum"))).json()
    assert data["inside_water"] is True
    assert data["status"] == "enchente"
    assert "chega à área urbana de Muçum" in data["text"]
    assert data["alerts"] == [a for a in data["alerts"] if a["city_id"] is None]  # só o alerta da região


def test_status_da_cidade_erros(client):
    assert client.get("/api/me/city-status").status_code == 401

    register(client, email="sem@cidade.com")
    token = login(client, "sem@cidade.com", "senha123").json()["access_token"]
    r = client.get("/api/me/city-status", headers=auth_header(token))
    assert r.status_code == 404
    assert r.json()["detail"] == "Cadastre sua cidade para ver o status"

    r = client.get("/api/me/city-status", headers=auth_header(token_cidadao(client, city="Porto Alegre")))
    assert r.status_code == 404
    assert "ainda não é monitorada" in r.json()["detail"]

