import time

import httpx
import pytest
from shapely.geometry import box

from app.data.regions import REGIONS
from app.providers import WaterMask, WaterProvider
from app.routers import regions as regions_router
from app.services import enso, geo, water

TAQUARI = REGIONS["vale-do-taquari"]
BASE = "/api/regions/vale-do-taquari"

# Trecho no formato do arquivo da NOAA, com linhas estranhas de propósito
ONI_TEXT = """ SEAS  YR   TOTAL   ANOM
  NDJ 2021  25.53  -1.06
  DJF 2022  25.60  -0.97
  JFM 2022  25.92  -0.92
  AMJ 2023  28.27   0.48
  JJA 2023  28.36   0.50
  SON 2023  28.72   1.81
  DJF 2024  28.18   1.80
  AMJ 2024  28.62   0.50
  MJJ 2024  28.27  -0.50
  linha quebrada
  XXX 2024  1  2
"""


@pytest.fixture(autouse=True)
def noaa_ok(monkeypatch):
    """Por padrão a NOAA responde com ONI_TEXT. Devolve a lista de chamadas feitas."""
    enso.clear_cache()
    calls = mock_noaa(monkeypatch, lambda request: httpx.Response(200, text=ONI_TEXT))
    yield calls
    enso.clear_cache()


def mock_noaa(monkeypatch, handler):
    calls = []

    def wrapper(request):
        calls.append(request)
        return handler(request)

    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(wrapper))
    return calls


def noaa_down(request):
    raise httpx.ConnectError("sem conexão", request=request)


# --- ONI / ENSO ---

def test_parse_oni_mes_central_e_fase():
    series = enso.parse_oni(ONI_TEXT)
    months = {p["month"]: p for p in series}
    assert len(series) == 9  # linhas inválidas ignoradas
    assert months["2021-12"]["season"] == "NDJ"  # NDJ -> dezembro do mesmo ano
    assert months["2022-01"]["season"] == "DJF"  # DJF -> janeiro
    assert months["2023-07"]["oni"] == 0.50
    # Limites da classificação: ±0.5 já conta como El Niño / La Niña
    assert months["2023-07"]["phase"] == "El Niño"
    assert months["2024-06"]["phase"] == "La Niña"
    assert months["2023-05"]["phase"] == "Neutro"


def test_enso_endpoint(client, noaa_ok):
    r = client.get("/api/climate/enso")
    assert r.status_code == 200
    data = r.json()
    assert data["live"] is True
    assert data["error"] is None
    assert data["source"] == "NOAA CPC"
    assert data["count"] == 9
    assert data["latest"]["month"] == "2024-06"

    filtered = client.get("/api/climate/enso?start=2024-01").json()
    assert [p["month"] for p in filtered["series"]] == ["2024-01", "2024-05", "2024-06"]
    assert filtered["latest"]["month"] == "2024-06"


def test_enso_usa_cache(client, noaa_ok):
    client.get("/api/climate/enso")
    client.get("/api/climate/enso")
    client.get(f"{BASE}/timeline?start=2024-01&end=2024-02")
    assert len(noaa_ok) == 1


def test_enso_falha_sem_cache(client, monkeypatch):
    mock_noaa(monkeypatch, noaa_down)
    data = client.get("/api/climate/enso").json()
    assert data["live"] is False
    assert data["series"] == []
    assert data["latest"] is None
    assert "Falha ao consultar a NOAA" in data["error"]


def test_enso_falha_usa_ultimo_cache(client, monkeypatch):
    assert client.get("/api/climate/enso").json()["live"] is True
    enso._cache["expires"] = time.monotonic() - 1  # cache venceu
    calls = mock_noaa(monkeypatch, lambda request: httpx.Response(503, text="fora do ar"))

    data = client.get("/api/climate/enso").json()
    assert data["live"] is False
    assert data["error"]
    assert data["count"] == 9  # dados antigos continuam disponíveis

    # Logo depois de falhar, não tenta a NOAA de novo a cada requisição
    client.get("/api/climate/enso")
    assert len(calls) == 1


def test_enso_resposta_sem_dados(client, monkeypatch):
    mock_noaa(monkeypatch, lambda request: httpx.Response(200, text="<html>manutenção</html>"))
    data = client.get("/api/climate/enso").json()
    assert data["live"] is False
    assert data["error"]


# --- Linha do tempo ---

def test_timeline_padrao_vai_de_2022_ate_mes_atual(client):
    data = client.get(f"{BASE}/timeline").json()
    assert data["start"] == "2022-01"
    assert data["end"] == water.current_month()
    assert data["series"][0]["date"] == "2022-01"
    assert data["series"][-1]["date"] == water.current_month()
    assert len(data["series"]) == len(water.month_range("2022-01", water.current_month()))


def test_timeline_e_demo_e_explica(client):
    data = client.get(f"{BASE}/timeline?start=2022-01&end=2024-12").json()
    assert data["source"] == "demo"
    assert "NISAR" in data["note"] and "2025" in data["note"]
    assert all(p["source"] == "demo" for p in data["series"])
    assert set(data["series"][0]) == {
        "date", "water_area_km2", "anomaly_pct", "status", "oni", "enso_phase", "event", "source",
    }


def test_timeline_reflete_eventos_conhecidos(client):
    series = {p["date"]: p for p in client.get(f"{BASE}/timeline?start=2022-01&end=2024-12").json()["series"]}

    # Estiagem de 2022 até o início de 2023
    assert all(series[f"2022-{m:02d}"]["status"] == "seca" for m in [1, 2, 3, 4, 11, 12])
    assert series["2023-01"]["status"] == "seca"

    # Enchentes de set/2023, nov/2023 e mai/2024
    for month in ["2023-09", "2023-11", "2024-05"]:
        assert series[month]["status"] == "enchente"
        assert series[month]["event"]
        assert series[month]["anomaly_pct"] > 80

    # Maio de 2024 é a maior mancha da série
    biggest = max(series.values(), key=lambda p: p["water_area_km2"])
    assert biggest["date"] == "2024-05"
    assert series["2024-03"]["status"] == "normal"


def test_timeline_deterministica(client):
    url = f"{BASE}/timeline?start=2022-01&end=2024-12"
    assert client.get(url).json()["series"] == client.get(url).json()["series"]


def test_timeline_preenche_oni(client):
    series = {p["date"]: p for p in client.get(f"{BASE}/timeline?start=2023-10&end=2024-07").json()["series"]}
    assert series["2023-10"]["oni"] == 1.81
    assert series["2023-10"]["enso_phase"] == "El Niño"
    assert series["2024-06"]["enso_phase"] == "La Niña"
    # Mês sem estação no arquivo fica sem ONI
    assert series["2023-12"]["oni"] is None
    assert series["2023-12"]["enso_phase"] is None


def test_timeline_sem_noaa_continua_funcionando(client, monkeypatch):
    mock_noaa(monkeypatch, noaa_down)
    r = client.get(f"{BASE}/timeline?start=2024-01&end=2024-06")
    assert r.status_code == 200
    data = r.json()
    assert data["enso"]["live"] is False
    assert data["enso"]["error"]
    assert all(p["oni"] is None and p["enso_phase"] is None for p in data["series"])
    assert data["series"][4]["status"] == "enchente"


@pytest.mark.parametrize("query, detail", [
    ("start=2024-13", "Mês inválido em 'start': use o formato AAAA-MM (ex.: 2024-05)"),
    ("start=maio", "Mês inválido em 'start': use o formato AAAA-MM (ex.: 2024-05)"),
    ("start=2024-5", "Mês inválido em 'start': use o formato AAAA-MM (ex.: 2024-05)"),
    ("start=2024-05&end=2024-01", "'end' deve ser depois de 'start'"),
    ("end=2999-01", "O mês em 'end' está no futuro"),
])
def test_timeline_parametros_invalidos(client, query, detail):
    r = client.get(f"{BASE}/timeline?{query}")
    assert r.status_code == 422
    assert r.json()["detail"] == detail


def test_timeline_regiao_inexistente(client):
    r = client.get("/api/regions/atlantida/timeline")
    assert r.status_code == 404
    assert r.json()["detail"] == "Região não encontrada"


# --- Mancha d'água ---

def test_water_mask_geojson(client):
    data = client.get(f"{BASE}/water-mask?date=2024-05").json()
    assert data["type"] == "FeatureCollection"
    assert data["source"] == "demo"
    assert data["note"]
    feature = data["features"][0]
    assert feature["geometry"]["type"] == "Polygon"
    props = feature["properties"]
    assert props["date"] == "2024-05"
    assert props["source"] == "demo"
    assert props["status"] == "enchente"
    assert props["cidades_atingidas"] == [c["name"] for c in TAQUARI["cities"]]

    # Toda a mancha fica perto do bbox da região
    lon_min, lat_min, lon_max, lat_max = TAQUARI["bbox"]
    lons = [x for x, _ in feature["geometry"]["coordinates"][0]]
    lats = [y for _, y in feature["geometry"]["coordinates"][0]]
    assert lon_min - 0.05 < min(lons) and max(lons) < lon_max + 0.05
    assert lat_min - 0.05 < min(lats) and max(lats) < lat_max + 0.05


def test_water_mask_largura_acompanha_nivel(client):
    def area(month):
        return client.get(f"{BASE}/water-mask?date={month}").json()["features"][0]["properties"]["water_area_km2"]

    assert area("2023-01") < area("2024-03") < area("2023-11") < area("2024-05")


def test_water_mask_seca_nao_atinge_cidades(client):
    props = client.get(f"{BASE}/water-mask?date=2022-08").json()["features"][0]["properties"]
    assert props["cidades_atingidas"] == []


def test_area_calculada_em_metros_nao_em_graus():
    # Faixa de 300 m ao longo de ~93 km de rio: algo perto de 28 km²
    mask = geo.buffer_line(TAQUARI["river"]["coordinates"], 150, TAQUARI)
    river_m = geo.to_metric(mask, TAQUARI)
    assert 25 < geo.area_km2(mask, TAQUARI) < 32
    assert river_m.area / 1e6 == pytest.approx(geo.area_km2(mask, TAQUARI))
    # A área em graus² seria minúscula: garante que não usamos graus por engano
    assert mask.area < 0.01
    assert geo.utm_epsg(TAQUARI) == 32722


def test_water_mask_data_invalida(client):
    r = client.get(f"{BASE}/water-mask?date=2024/05")
    assert r.status_code == 422
    assert "AAAA-MM" in r.json()["detail"]
    assert client.get(f"{BASE}/water-mask").status_code == 422


# --- Antes / depois ---

def test_compare_enchente_de_maio_2024(client):
    r = client.get(f"{BASE}/compare?before=2024-03&after=2024-05")
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "demo"
    assert data["note"]
    assert data["before"]["date"] == "2024-03"
    assert data["after"]["date"] == "2024-05"
    assert data["before"]["geojson"]["type"] == "FeatureCollection"
    assert data["delta_km2"] == pytest.approx(data["after"]["water_area_km2"] - data["before"]["water_area_km2"], abs=0.01)
    assert data["delta_pct"] > 200
    assert "Lajeado" in data["cidades_atingidas"]

    summary = data["summary"]
    assert summary.startswith("Entre março de 2024 e maio de 2024")
    assert "aumentou" in summary
    assert "saiu do leito" in summary
    assert "Lajeado" in summary
    assert "ilustrativos" in summary


def test_compare_agua_baixando(client):
    data = client.get(f"{BASE}/compare?before=2024-05&after=2024-08").json()
    assert data["delta_km2"] < 0
    assert data["cidades_atingidas"] == []
    assert "diminuiu" in data["summary"]
    assert "deixou as áreas urbanas" in data["summary"]


def test_compare_entrando_na_seca(client):
    data = client.get(f"{BASE}/compare?before=2021-08&after=2022-02").json()
    assert "diminuiu" in data["summary"]
    assert "estiagem" in data["summary"]


def test_compare_sem_mudanca(client):
    data = client.get(f"{BASE}/compare?before=2024-02&after=2024-03").json()
    assert data["delta_km2"] == 0
    assert "praticamente igual" in data["summary"]


def test_compare_parametros(client):
    assert client.get(f"{BASE}/compare?before=2024-03").status_code == 422
    r = client.get(f"{BASE}/compare?before=2024-03&after=2024-00")
    assert r.status_code == 422
    assert r.json()["detail"].startswith("Mês inválido em 'after'")
    assert client.get("/api/regions/atlantida/compare?before=2024-03&after=2024-05").status_code == 404


# --- Troca de provider ---

class FakeProvider(WaterProvider):
    """Provider de mentira: mostra que os endpoints não dependem do DemoProvider."""

    source = "fake"

    def water_mask(self, region, month):
        size = 0.02 if month == "2024-05" else 0.01
        lat, lon = -29.467, -51.961  # Lajeado
        return WaterMask(date=month, geometry=box(lon - size, lat - size, lon + size, lat + size), source=self.source)

    def baseline(self, region):
        return self.water_mask(region, "normal")


def test_endpoints_usam_o_provider_da_regiao(client, monkeypatch):
    monkeypatch.setattr(regions_router, "get_provider", lambda region_id: FakeProvider())

    timeline = client.get(f"{BASE}/timeline?start=2024-04&end=2024-05").json()
    assert timeline["source"] == "fake"
    assert timeline["note"] is None
    assert [p["anomaly_pct"] for p in timeline["series"]] == [0.0, 300.0]

    mask = client.get(f"{BASE}/water-mask?date=2024-05").json()
    assert mask["source"] == "fake"
    assert mask["features"][0]["properties"]["cidades_atingidas"] == ["Lajeado"]

    compare = client.get(f"{BASE}/compare?before=2024-04&after=2024-05").json()
    assert compare["source"] == "fake"
    assert "ilustrativos" not in compare["summary"]
