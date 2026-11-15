import httpx
import pytest

from app.config import settings
from app.services import forecast

URL = "/api/regions/vale-do-taquari/forecast"
DAILY = {"time": ["2026-11-16", "2026-11-17", "2026-11-18"],
         "precipitation_sum": [0.0, 12.4, 3.1],
         "precipitation_probability_max": [10, 90, 40],
         "temperature_2m_min": [14.2, 16.0, 15.1],
         "temperature_2m_max": [27.5, 22.3, 24.0]}


@pytest.fixture
def meteo(monkeypatch):
    """Open-Meteo falsa: guarda os pedidos e responde o que o teste mandar."""
    calls = []
    state = {"status": 200, "json": {"daily": DAILY}}

    def handler(request):
        calls.append(request)
        return httpx.Response(state["status"], json=state["json"])

    forecast.clear_cache()
    monkeypatch.setattr(forecast, "_transport", httpx.MockTransport(handler))
    yield calls, state
    forecast.clear_cache()


def test_previsao_ao_vivo(client, meteo):
    calls, _ = meteo
    r = client.get(URL)
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "open-meteo" and data["live"] is True and data["error"] is None
    assert data["lat"] == -29.42 and data["lon"] == -51.93
    assert data["total_rain_mm"] == 15.5
    assert data["days"][1] == {"date": "2026-11-17", "rain_mm": 12.4, "rain_probability_pct": 90,
                               "tmin_c": 16.0, "tmax_c": 22.3}
    assert "17/11" in data["summary"] and "15,5 mm" in data["summary"]
    assert "não previsão de enchente" in data["kind"]
    params = calls[0].url.params
    assert params["latitude"] == "-29.42" and params["forecast_days"] == "7"


def test_previsao_usa_cache(client, meteo):
    calls, _ = meteo
    client.get(URL)
    client.get(URL)
    assert len(calls) == 1
    client.get(URL, params={"days": 3})  # outro número de dias é outra entrada
    assert len(calls) == 2


def test_cache_dura_pelo_menos_30_min():
    assert settings.forecast_cache_ttl_seconds >= 30 * 60


def test_falha_sem_cache_responde_live_false(client, meteo):
    _, state = meteo
    state["status"] = 503
    r = client.get(URL)
    assert r.status_code == 200
    data = r.json()
    assert data["live"] is False and data["days"] == [] and "Open-Meteo" in data["error"]


def test_falha_com_cache_devolve_o_ultimo(client, meteo, monkeypatch):
    calls, state = meteo
    client.get(URL)
    monkeypatch.setattr(settings, "forecast_cache_ttl_seconds", -1)  # o cache vence na hora
    client.get(URL)
    state["status"] = 500
    forecast._cache[("vale-do-taquari", 7)]["expires"] = 0.0
    data = client.get(URL).json()
    assert data["live"] is False and len(data["days"]) == 3 and data["error"]


def test_depois_de_falhar_espera_para_tentar_de_novo(client, meteo):
    calls, state = meteo
    state["status"] = 503
    client.get(URL)
    client.get(URL)
    assert len(calls) == 1


def test_resposta_sem_dias_conta_como_falha(client, meteo):
    _, state = meteo
    state["json"] = {"daily": {}}
    data = client.get(URL).json()
    assert data["live"] is False and data["error"]


def test_modo_offline_nao_chama_a_open_meteo(client, meteo, monkeypatch):
    calls, _ = meteo
    monkeypatch.setattr(settings, "offline_mode", True)
    data = client.get(URL).json()
    assert calls == [] and data["live"] is False


def test_validacao(client, meteo):
    assert client.get(URL, params={"days": 0}).status_code == 422
    assert client.get("/api/regions/nao-existe/forecast").status_code == 404
