import httpx
import pytest

from app.config import settings
from app.services import places
from tests.passes_fixture import fotos_dir  # noqa: F401  (fixture)

URL = "/api/places"
NOMINATIM = [
    {"lat": "-29.4589", "lon": "-51.9656", "name": "Centro", "addresstype": "suburb",
     "address": {"city": "Lajeado", "suburb": "Centro"}},
    {"lat": "-29.4950", "lon": "-51.9700", "name": "Rua Júlio de Castilhos", "addresstype": "road",
     "address": {"town": "Estrela"}},
    {"lat": "-29.7900", "lon": "-51.8700", "name": "Praça", "addresstype": "square", "address": {"town": "Taquari"}},
    {"lat": "x", "lon": "y", "name": "quebrado"},
]


@pytest.fixture
def osm(monkeypatch):
    calls = []
    state = {"status": 200, "json": NOMINATIM}

    def handler(request):
        calls.append(request)
        return httpx.Response(state["status"], json=state["json"])

    places.clear_cache()
    monkeypatch.setattr(places, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(settings, "nominatim_min_interval_seconds", 0.0)
    yield calls, state
    places.clear_cache()


def test_municipios_do_ibge_primeiro(client, osm, fotos_dir):
    data = client.get(URL, params={"q": "laje"}).json()
    assert data["source"] == "ibge+osm" and data["error"] is None
    first = data["items"][0]
    assert first["name"] == "Lajeado" and first["kind"] == "município" and first["source"] == "ibge"
    assert first["inside_coverage"] is True


def test_busca_sem_acento(client, osm, fotos_dir):
    names = [i["name"] for i in client.get(URL, params={"q": "mucum"}).json()["items"]]
    assert "Muçum" in names


def test_bairros_do_nominatim(client, osm, fotos_dir):
    calls, _ = osm
    items = client.get(URL, params={"q": "centro"}).json()["items"]
    osm_items = [i for i in items if i["source"] == "osm"]
    assert osm_items[0] == {"name": "Centro, Lajeado", "kind": "bairro", "lat": -29.4589, "lon": -51.9656,
                            "inside_coverage": True, "source": "osm"}
    assert osm_items[1]["kind"] == "road"
    assert osm_items[2]["inside_coverage"] is False  # Taquari fica fora da área processada
    assert len(osm_items) == 3  # o item sem coordenada válida fica de fora
    request = calls[0]
    assert request.headers["user-agent"] == settings.nominatim_user_agent
    assert "WaterWaltz" in request.headers["user-agent"]
    assert request.url.params["bounded"] == "1" and request.url.params["countrycodes"] == "br"


def test_nominatim_so_a_partir_de_3_letras(client, osm, fotos_dir):
    calls, _ = osm
    assert client.get(URL, params={"q": "la"}).status_code == 200
    assert calls == []
    assert client.get(URL, params={"q": "l"}).status_code == 422


def test_cache_do_nominatim(client, osm, fotos_dir):
    calls, _ = osm
    client.get(URL, params={"q": "centro"})
    client.get(URL, params={"q": "Centro "})
    assert len(calls) == 1


def test_no_maximo_um_pedido_por_segundo(client, osm, fotos_dir, monkeypatch):
    calls, _ = osm
    monkeypatch.setattr(settings, "nominatim_min_interval_seconds", 1.0)
    sleeps = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(places.asyncio, "sleep", fake_sleep)
    client.get(URL, params={"q": "centro"})
    client.get(URL, params={"q": "estrela"})
    assert len(calls) == 2
    assert len(sleeps) == 1 and 0 < sleeps[0] <= 1.0


def test_falha_do_nominatim_mantem_os_municipios(client, osm, fotos_dir):
    _, state = osm
    state["status"] = 429
    data = client.get(URL, params={"q": "lajeado"}).json()
    assert [i["name"] for i in data["items"]] == ["Lajeado"]
    assert "indisponível" in data["error"]


def test_modo_offline_so_busca_local(client, osm, fotos_dir, monkeypatch):
    calls, _ = osm
    monkeypatch.setattr(settings, "offline_mode", True)
    data = client.get(URL, params={"q": "estrela"}).json()
    assert calls == [] and data["items"][0]["name"] == "Estrela" and data["error"]


def test_regiao_inexistente(client, osm):
    assert client.get(URL, params={"q": "lajeado", "region_id": "nao-existe"}).status_code == 404
