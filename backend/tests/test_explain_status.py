import httpx
import pytest

from app import providers
from app.data.explain import TOPICS
from app.main import app
from app.services import asf, enso, water
from tests.test_water import ONI_TEXT, FakeProvider

BASE = "/api/regions/vale-do-taquari"

SCENES = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"sceneName": "NISAR_ANTIGA", "startTime": "2026-10-27T21:33:51Z", "processingLevel": "GCOV"}},
        {"type": "Feature", "geometry": None,
         "properties": {"sceneName": "NISAR_RECENTE", "startTime": "2026-10-31T09:22:27Z", "processingLevel": "GCOV"}},
    ],
}


def offline(request):
    raise httpx.ConnectError("sem conexão", request=request)


@pytest.fixture(autouse=True)
def servicos_externos(monkeypatch):
    """NOAA e ASF falsos, com respostas boas por padrão."""
    asf.clear_cache()
    enso.clear_cache()
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(lambda r: httpx.Response(200, text=ONI_TEXT)))
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(lambda r: httpx.Response(200, json=SCENES)))
    yield
    asf.clear_cache()
    enso.clear_cache()


# --- Explicações ---

def test_lista_topicos(client):
    r = client.get("/api/explain")
    assert r.status_code == 200
    ids = [t["id"] for t in r.json()]
    assert ids == ["sar", "agua-no-radar", "nisar", "el-nino", "la-nina", "como-ler-o-mapa"]
    for topic in r.json():
        assert topic["title"] and topic["summary"] and topic["body"] and topic["icon"]


def test_topico(client):
    data = client.get("/api/explain/agua-no-radar").json()
    assert data["id"] == "agua-no-radar"
    assert "escura" in data["title"]
    assert data["legend"] is None


def test_como_ler_o_mapa_tem_legenda(client):
    legend = client.get("/api/explain/como-ler-o-mapa").json()["legend"]
    labels = [item["label"] for item in legend]
    assert {"Seca", "Normal", "Alerta", "Enchente", "Água candidata", "Sem observação válida"} <= set(labels)
    assert all(item["color"].startswith("#") and len(item["color"]) == 7 for item in legend)


def test_legenda_dos_status_bate_com_a_classificacao():
    # Os limites citados no texto da legenda são os mesmos usados no código
    assert water.classify_status(-25) == "seca"
    assert water.classify_status(-24.9) == "normal"
    assert water.classify_status(29.9) == "normal"
    assert water.classify_status(30) == "alerta"
    assert water.classify_status(80) == "enchente"


def test_textos_de_clima_nao_atribuem_enchente_ao_el_nino():
    # Decisão D-F do time: só tendência, nunca "a enchente foi causada pelo El Niño"
    for topic in TOPICS:
        text = topic["body"].lower()
        assert "causada pelo el niño" not in text
        assert "causada pela la niña" not in text
        assert "oficial" not in text
    el_nino = next(t for t in TOPICS if t["id"] == "el-nino")
    assert "não diz que uma enchente específica foi causada" in el_nino["body"]


def test_topico_inexistente(client):
    r = client.get("/api/explain/buraco-negro")
    assert r.status_code == 404
    assert r.json()["detail"] == "Tópico não encontrado"


# --- Status da região ---

def test_status(client):
    r = client.get(f"{BASE}/status")
    assert r.status_code == 200
    data = r.json()
    assert data["region_id"] == "vale-do-taquari"
    assert data["region_name"] == "Vale do Taquari"

    assert data["water"]["date"] == water.current_month()
    assert data["water"]["source"] == "demo"
    assert data["water"]["note"]
    assert data["water"]["status"] in {"seca", "normal", "alerta", "enchente"}

    # Última estação do ONI_TEXT: MJJ 2024, La Niña
    assert data["enso"] == {"live": True, "month": "2024-06", "season": "MJJ", "oni": -0.5,
                            "phase": "La Niña", "error": None}

    # Cena mais recente, mesmo vindo fora de ordem do ASF
    assert data["latest_scene"]["live"] is True
    assert data["latest_scene"]["scene"]["granule"] == "NISAR_RECENTE"

    text = data["text"]
    assert "(valor ilustrativo)" in text
    assert "La Niña (ONI -0,5)" in text
    assert "31/10/2026" in text


def test_status_sem_internet(client, monkeypatch):
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(offline))
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(offline))
    r = client.get(f"{BASE}/status")
    assert r.status_code == 200
    data = r.json()
    assert data["enso"]["live"] is False and data["enso"]["phase"] is None and data["enso"]["error"]
    assert data["latest_scene"] == {"live": False, "scene": None, "error": data["latest_scene"]["error"]}
    assert data["latest_scene"]["error"]
    assert "Não foi possível consultar as cenas do NISAR" in data["text"]
    assert "NOAA" not in data["text"]


def test_status_sem_cenas(client, monkeypatch):
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(
        lambda r: httpx.Response(200, json={"type": "FeatureCollection", "features": []})))
    data = client.get(f"{BASE}/status").json()
    assert data["latest_scene"]["scene"] is None
    assert "Nenhuma cena do NISAR" in data["text"]


def test_status_usa_o_provider(client, monkeypatch):
    monkeypatch.setattr(providers, "get_provider", lambda region_id: FakeProvider())
    data = client.get(f"{BASE}/status").json()
    assert data["water"]["source"] == "fake"
    assert "ilustrativo" not in data["text"]


def test_status_regiao_inexistente(client):
    r = client.get("/api/regions/atlantida/status")
    assert r.status_code == 404
    assert r.json()["detail"] == "Região não encontrada"


# --- Documentação (Swagger) ---

FILE_ROUTES = {"/api/aoi", "/api/grid", "/api/files/{path}", "/api/download/{kind}"}
PT_TAGS = {"Sistema", "Autenticação", "Regiões", "Água", "Clima", "Explicações", "Radar processado"}


def test_openapi_tags_em_portugues_e_rotas_documentadas():
    spec = app.openapi()
    assert {t["name"] for t in spec["tags"]} == PT_TAGS
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            assert len(op["tags"]) == 1 and op["tags"][0] in PT_TAGS, f"{method} {path} sem tag"
            assert op.get("summary"), f"{method} {path} sem summary"
            ok = op["responses"].get("200") or op["responses"].get("201")
            content = ok["content"]
            if path in FILE_ROUTES:
                assert any(t != "application/json" for t in content) or path == "/api/grid"
            else:
                # Toda rota JSON tem um schema de resposta (response_model)
                assert content["application/json"]["schema"], f"{method} {path} sem response_model"
