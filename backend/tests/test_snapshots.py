import json

import httpx
import pytest

from app.config import settings
from app.services import asf, enso, snapshots

BASE = "/api/regions/vale-do-taquari"
TAQUARI_WKT = "POLYGON((-52.15 -29.85,-51.7 -29.85,-51.7 -29.05,-52.15 -29.05,-52.15 -29.85))"
SNAPSHOT_DATE = "2026-11-10T12:00:00+00:00"


def scene(day: str, browse: bool = True) -> dict:
    name = f"NISAR_L2_PR_GCOV_TESTE_{day.replace('-', '')}"
    return {"type": "Feature", "geometry": None, "properties": {
        "sceneName": name, "startTime": f"{day}T09:22:26Z", "processingLevel": "GCOV",
        "browse": [f"https://exemplo.test/{name}.png"] if browse else None,
    }}


ASF_SNAPSHOT = {
    "snapshot_date": SNAPSHOT_DATE,
    "searches": [{
        "region_id": "vale-do-taquari", "wkt": TAQUARI_WKT, "product": "GCOV",
        "features": [scene("2026-06-17"), scene("2026-07-15"), scene("2026-07-23", browse=False),
                     scene("2026-10-31")],
    }],
}
NOAA_SNAPSHOT = {
    "snapshot_date": SNAPSHOT_DATE,
    "url": "https://noaa.test/oni.ascii.txt",
    "text": " SEAS  YR   TOTAL   ANOM\n  JJA 2026  28.10   1.20\n  JAS 2026  28.50   1.90\n",
}


def offline(request):
    raise httpx.ConnectError("sem conexão", request=request)


@pytest.fixture
def snap_dir(tmp_path, monkeypatch):
    """Snapshots de teste numa pasta temporária; ASF e NOAA fora do ar."""
    monkeypatch.setattr(settings, "snapshot_dir", str(tmp_path))
    (tmp_path / snapshots.ASF_FILE).write_text(json.dumps(ASF_SNAPSHOT), encoding="utf-8")
    (tmp_path / snapshots.NOAA_FILE).write_text(json.dumps(NOAA_SNAPSHOT), encoding="utf-8")
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(offline))
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(offline))
    enso.clear_cache()
    yield tmp_path
    enso.clear_cache()


def test_wkt_do_teste_bate_com_o_da_regiao():
    from app.data.regions import REGIONS, bbox_to_wkt
    assert bbox_to_wkt(REGIONS["vale-do-taquari"]["bbox"]) == TAQUARI_WKT


def test_save_e_load(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "snapshot_dir", str(tmp_path / "nova"))
    assert snapshots.load(snapshots.NOAA_FILE) is None
    snapshots.save(snapshots.NOAA_FILE, {"text": "abc"})
    data = snapshots.load(snapshots.NOAA_FILE)
    assert data["text"] == "abc"
    assert data["snapshot_date"]


# --- fallback com OFFLINE_MODE=false ---

def test_cenas_falham_e_usam_snapshot(client, snap_dir):
    data = client.get(f"{BASE}/scenes").json()
    assert data["live"] is False
    assert data["snapshot_date"] == SNAPSHOT_DATE
    assert "Falha ao consultar o ASF" in data["error"]
    assert [s["start_time"][:10] for s in data["scenes"]] == ["2026-10-31", "2026-07-23", "2026-07-15", "2026-06-17"]


def test_snapshot_respeita_filtros_da_busca(client, snap_dir):
    data = client.get(f"{BASE}/scenes?start=2026-07-01&end=2026-08-01&limit=1").json()
    assert data["count"] == 1
    assert data["scenes"][0]["start_time"].startswith("2026-07-23")
    # Produto que não está no snapshot: lista vazia, mas com o erro original
    other = client.get(f"{BASE}/scenes?product=GUNW").json()
    assert other["scenes"] == [] and other["snapshot_date"] is None
    assert "Falha ao consultar o ASF" in other["error"]


def test_snapshot_nao_entra_no_cache(client, snap_dir, monkeypatch):
    client.get(f"{BASE}/scenes")
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(
        lambda r: httpx.Response(200, json={"type": "FeatureCollection", "features": [scene("2026-11-12")]})))
    data = client.get(f"{BASE}/scenes").json()
    assert data["live"] is True  # voltou a internet: usa o ASF de novo
    assert data["snapshot_date"] is None


def test_enso_falha_e_usa_snapshot(client, snap_dir):
    data = client.get("/api/climate/enso").json()
    assert data["live"] is False
    assert data["snapshot_date"] == SNAPSHOT_DATE
    assert data["latest"]["month"] == "2026-08"
    assert "Falha ao consultar a NOAA" in data["error"]


def test_enso_ao_vivo_nao_tem_snapshot_date(client, snap_dir, monkeypatch):
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(
        lambda r: httpx.Response(200, text="  JAS 2026  28.50   1.90\n")))
    data = client.get("/api/climate/enso").json()
    assert data["live"] is True
    assert data["snapshot_date"] is None


def test_sem_internet_e_sem_snapshot(client, snap_dir):
    for name in [snapshots.ASF_FILE, snapshots.NOAA_FILE]:
        (snap_dir / name).unlink()
    scenes = client.get(f"{BASE}/scenes").json()
    assert scenes["live"] is False and scenes["scenes"] == [] and scenes["snapshot_date"] is None
    climate = client.get("/api/climate/enso").json()
    assert climate["series"] == [] and climate["snapshot_date"] is None


def test_status_e_timeline_mostram_snapshot(client, snap_dir):
    status = client.get(f"{BASE}/status").json()
    assert status["latest_scene"]["snapshot_date"] == SNAPSHOT_DATE
    assert status["latest_scene"]["scene"]["start_time"].startswith("2026-10-31")
    assert status["enso"]["snapshot_date"] == SNAPSHOT_DATE
    timeline = client.get(f"{BASE}/timeline?start=2026-07&end=2026-08").json()
    assert timeline["enso"]["snapshot_date"] == SNAPSHOT_DATE
    assert [p["oni"] for p in timeline["series"]] == [1.2, 1.9]


# --- OFFLINE_MODE=true ---

def test_modo_offline_nao_chama_a_internet(client, snap_dir, monkeypatch):
    calls = []

    def spy(request):
        calls.append(request)
        return httpx.Response(200, text="")

    monkeypatch.setattr(settings, "offline_mode", True)
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(spy))
    monkeypatch.setattr(enso, "_transport", httpx.MockTransport(spy))

    scenes = client.get(f"{BASE}/scenes").json()
    climate = client.get("/api/climate/enso").json()
    assert calls == []
    assert scenes["live"] is False and scenes["error"] is None and scenes["count"] == 4
    assert climate["live"] is False and climate["error"] is None and climate["count"] == 2
    assert scenes["snapshot_date"] == climate["snapshot_date"] == SNAPSHOT_DATE


def test_modo_offline_sem_snapshot_explica(client, snap_dir, monkeypatch):
    monkeypatch.setattr(settings, "offline_mode", True)
    monkeypatch.setattr(settings, "snapshot_dir", str(snap_dir / "vazia"))
    assert "Modo offline" in client.get(f"{BASE}/scenes").json()["error"]
    assert "Modo offline" in client.get("/api/climate/enso").json()["error"]


# --- browse no /compare ---

def test_compare_traz_browse_da_cena_mais_proxima(client, snap_dir):
    data = client.get(f"{BASE}/compare?before=2024-05&after=2026-07").json()
    assert data["before"]["browse_url"] is None  # NISAR ainda não operava em 2024
    assert data["before"]["browse_date"] is None
    # 15/07 é o mais perto do meio do mês; 23/07 não tem browse
    assert data["after"]["browse_url"] == "https://exemplo.test/NISAR_L2_PR_GCOV_TESTE_20260715.png"
    assert data["after"]["browse_date"] == "2026-07-15T09:22:26Z"


def test_compare_sem_cena_por_perto(client, snap_dir):
    data = client.get(f"{BASE}/compare?before=2026-09&after=2026-10").json()
    assert data["before"]["browse_url"] is None  # 31/10 está a mais de 30 dias de 15/09
    assert data["after"]["browse_url"].endswith("20261031.png")
