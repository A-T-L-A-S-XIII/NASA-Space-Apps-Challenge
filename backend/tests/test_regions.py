import httpx
import pytest

from app.services import asf

GEOMETRY = {"type": "Polygon", "coordinates": [[[-52, -30], [-51, -30], [-51, -29], [-52, -29], [-52, -30]]]}

# Respostas no formato do ASF, variando os campos de propósito
FEATURES = [
    {
        # Formato atual do ASF: sceneName, browse em lista, bytes como dicionário
        "type": "Feature",
        "geometry": GEOMETRY,
        "properties": {
            "sceneName": "NISAR_GCOV_ANTIGA",
            "startTime": "2026-10-01T09:22:24Z",
            "processingLevel": "GCOV",
            "flightDirection": "ASCENDING",
            "collectionName": "NISAR_L2_GCOV_PROVISIONAL_V1",
            "url": "https://exemplo/antiga.h5",
            "fileName": "antiga.h5",
            "browse": ["https://exemplo/antiga_thumbnail.png", "https://exemplo/antiga.png"],
            "bytes": {
                "antiga.h5": {"bytes": 1048576 * 100, "format": "HDF5"},
                "antiga.png": {"bytes": 2048, "format": "PNG"},
            },
        },
    },
    {
        # Formato alternativo: só fileID, browse como texto, bytes como número
        "type": "Feature",
        "geometry": GEOMETRY,
        "properties": {
            "fileID": "NISAR_GCOV_RECENTE",
            "startTime": "2026-10-31T09:22:24Z",
            "processingLevel": "GCOV",
            "flightDirection": "DESCENDING",
            "dataMaturity": "Beta",
            "browse": "https://exemplo/recente.png",
            "bytes": 1048576 * 50,
        },
    },
    # Lixo que deve ser ignorado sem quebrar
    {"type": "Feature", "properties": {"startTime": "2026-11-01T00:00:00Z"}},
    "não é uma feature",
]


@pytest.fixture(autouse=True)
def limpar_cache():
    asf.clear_cache()
    yield
    asf.clear_cache()


def mock_asf(monkeypatch, handler):
    """Troca o HTTP do serviço ASF por um handler falso e conta as chamadas."""
    calls = []

    def wrapper(request):
        calls.append(request)
        return handler(request)

    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(wrapper))
    return calls


def ok_handler(request):
    return httpx.Response(200, json={"type": "FeatureCollection", "features": FEATURES})


# --- Regiões ---

def test_lista_regioes(client):
    r = client.get("/api/regions")
    assert r.status_code == 200
    ids = [region["id"] for region in r.json()]
    assert "vale-do-taquari" in ids


def test_detalhe_regiao(client):
    r = client.get("/api/regions/vale-do-taquari")
    assert r.status_code == 200
    data = r.json()
    assert data["bbox"] == [-52.15, -29.85, -51.70, -29.05]
    assert data["center"] == [-29.42, -51.93]
    assert data["zoom"] == 10
    assert len(data["cities"]) == 8
    assert data["cities"][0]["name"] == "Muçum"
    # Rio de norte a sul: latitude diminui
    lats = [lat for _, lat in data["river"]["coordinates"]]
    assert lats == sorted(lats, reverse=True)


def test_regiao_inexistente(client):
    r = client.get("/api/regions/atlantida")
    assert r.status_code == 404
    assert r.json()["detail"] == "Região não encontrada"


# --- Cenas NISAR ---

def test_cenas_sucesso(client, monkeypatch):
    calls = mock_asf(monkeypatch, ok_handler)
    r = client.get("/api/regions/vale-do-taquari/scenes?start=2026-01-01&end=2026-11-15")
    assert r.status_code == 200
    data = r.json()

    assert data["region_id"] == "vale-do-taquari"
    assert data["live"] is True
    assert data["error"] is None
    assert data["count"] == 2

    # Mais recente primeiro
    recente, antiga = data["scenes"]
    assert recente["granule"] == "NISAR_GCOV_RECENTE"
    assert recente["browse"] == "https://exemplo/recente.png"
    assert recente["size_mb"] == 50.0
    assert recente["data_maturity"] == "Beta"
    assert recente["flight_direction"] == "DESCENDING"
    assert recente["url"] is None

    assert antiga["granule"] == "NISAR_GCOV_ANTIGA"
    assert antiga["browse"] == "https://exemplo/antiga.png"  # não a miniatura
    assert antiga["size_mb"] == 100.0  # só o .h5 principal
    assert antiga["data_maturity"] == "provisional"
    assert antiga["geometry"] == GEOMETRY

    # Parâmetros enviados ao ASF
    params = calls[0].url.params
    assert params["dataset"] == "NISAR"
    assert params["processingLevel"] == "GCOV"
    assert params["output"] == "geojson"
    assert params["maxResults"] == "25"
    assert params["start"] == "2026-01-01"
    assert params["end"] == "2026-11-15"
    assert params["intersectsWith"] == (
        "POLYGON((-52.15 -29.85,-51.7 -29.85,-51.7 -29.05,-52.15 -29.05,-52.15 -29.85))"
    )
    assert data["query"]["processingLevel"] == "GCOV"


def test_cenas_produto_configuravel(client, monkeypatch):
    calls = mock_asf(monkeypatch, ok_handler)
    r = client.get("/api/regions/vale-do-taquari/scenes?product=gunw&limit=5")
    assert r.status_code == 200
    assert calls[0].url.params["processingLevel"] == "GUNW"
    assert calls[0].url.params["maxResults"] == "5"
    assert "start" not in calls[0].url.params


def test_cenas_usa_cache(client, monkeypatch):
    calls = mock_asf(monkeypatch, ok_handler)
    client.get("/api/regions/vale-do-taquari/scenes")
    client.get("/api/regions/vale-do-taquari/scenes")
    assert len(calls) == 1
    # Busca diferente não usa o mesmo cache
    client.get("/api/regions/vale-do-taquari/scenes?product=GUNW")
    assert len(calls) == 2


def test_cenas_sem_internet(client, monkeypatch):
    def handler(request):
        raise httpx.ConnectError("sem conexão", request=request)

    calls = mock_asf(monkeypatch, handler)
    r = client.get("/api/regions/vale-do-taquari/scenes")
    assert r.status_code == 200
    data = r.json()
    assert data["live"] is False
    assert data["count"] == 0
    assert data["scenes"] == []
    assert "Falha ao consultar o ASF" in data["error"]

    # Falha não fica no cache: a próxima chamada tenta de novo
    client.get("/api/regions/vale-do-taquari/scenes")
    assert len(calls) == 2


def test_cenas_asf_erro_500(client, monkeypatch):
    mock_asf(monkeypatch, lambda request: httpx.Response(500, text="erro interno"))
    data = client.get("/api/regions/vale-do-taquari/scenes").json()
    assert data["live"] is False
    assert data["scenes"] == []
    assert data["error"]


def test_cenas_asf_resposta_invalida(client, monkeypatch):
    mock_asf(monkeypatch, lambda request: httpx.Response(200, text="<html>manutenção</html>"))
    data = client.get("/api/regions/vale-do-taquari/scenes").json()
    assert data["live"] is False
    assert data["error"]


def test_cenas_regiao_inexistente_nao_chama_asf(client, monkeypatch):
    calls = mock_asf(monkeypatch, ok_handler)
    r = client.get("/api/regions/atlantida/scenes")
    assert r.status_code == 404
    assert r.json()["detail"] == "Região não encontrada"
    assert calls == []


def test_cenas_limite_invalido(client, monkeypatch):
    mock_asf(monkeypatch, ok_handler)
    r = client.get("/api/regions/vale-do-taquari/scenes?limit=0")
    assert r.status_code == 422
    assert r.json()["detail"] == "Dados inválidos"


# Trecho de uma resposta real do ASF (geojson) para a coleção NISAR_L2_GCOV_V1: não traz dataMaturity
GRANULO_V1 = "NISAR_L2_PR_GCOV_034_103_A_163_4005_DHDH_A_20261031T092224_20261031T092259_P05036_N_F_J_001"
FEATURE_GCOV_V1 = {
    "type": "Feature",
    "geometry": GEOMETRY,
    "properties": {
        "sceneName": GRANULO_V1,
        "fileID": GRANULO_V1,
        "startTime": "2026-10-31T09:22:24Z",
        "stopTime": "2026-10-31T09:22:59Z",
        "processingLevel": "GCOV",
        "flightDirection": "ASCENDING",
        "platform": "NISAR",
        "collectionName": "NISAR_L2_GCOV_V1",
        "productionConfiguration": "PR",
        "crid": "P05036",
        "fileName": f"{GRANULO_V1}.h5",
        "url": f"https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_V1/{GRANULO_V1}/{GRANULO_V1}.h5",
    },
}


def test_maturidade_da_colecao_gcov_v1_mockada(client, monkeypatch):
    """NISAR_L2_GCOV_V1 vem sem dataMaturity: a coleção sem rótulo é a validada."""
    mock_asf(monkeypatch, lambda request: httpx.Response(
        200, json={"type": "FeatureCollection", "features": [FEATURE_GCOV_V1]}))
    r = client.get("/api/regions/vale-do-taquari/scenes?start=2026-10-01&end=2026-11-15")
    assert r.status_code == 200
    (cena,) = r.json()["scenes"]
    assert cena["granule"] == GRANULO_V1
    assert cena["data_maturity"] == "validated"


@pytest.mark.parametrize("colecao,esperado", [
    ("NISAR_L2_GCOV_V1", "validated"),
    ("NISAR_L2_GCOV_PROVISIONAL_V1", "provisional"),
    ("NISAR_L2_GCOV_BETA_V1", "beta"),
    ("OUTRA_COLECAO_V1", None),  # fora do padrão NISAR: não inventa maturidade
    ("", None),
])
def test_maturidade_pelo_nome_da_colecao(colecao, esperado):
    assert asf._data_maturity({"collectionName": colecao}) == esperado
