import numpy as np
import pytest


@pytest.fixture()
def ds():
    from app.services.store import get_dataset

    return get_dataset()


def _water_point(ds, date_id):
    rows, cols = np.nonzero(ds.states[date_id] == 2)
    i = len(rows) // 2
    w, s, e, n = ds.bounds
    lat = n - (rows[i] + 0.5) * (n - s) / ds.height
    lon = w + (cols[i] + 0.5) * (e - w) / ds.width
    return lat, lon


def test_outside_aoi(client):
    r = client.get("/api/exposure", params={"lat": -30.03, "lon": -51.23}).json()
    assert r["inside_aoi"] is False and r["latest"] is None


def test_point_on_water(client, ds):
    last = ds.timeline["entries"][-1]["date_id"]
    lat, lon = _water_point(ds, last)
    r = client.get("/api/exposure", params={"lat": lat, "lon": lon}).json()
    assert r["latest"]["state"] == "candidate_water"
    assert r["nearest_candidate_water"]["distance_m"] == 0
    h = r["history"]
    assert 1 <= h["k"] <= h["n"] <= h["total"]
    assert sum(k for k, _ in h["by_sensor"].values()) == h["k"]


def test_every_statement_has_source_and_basis(client, ds):
    for loc in ds.localities["items"]:
        r = client.get("/api/exposure", params={"lat": loc["lat"], "lon": loc["lon"]}).json()
        assert r["disclaimers"]
        for s in r["statements"]:
            assert s["source"] and s["basis"] in ("radar", "external", "inference")


def test_access_vocabulary(client):
    # Near the DEV FIXTURE interruption point.
    r = client.get("/api/exposure", params={"lat": -29.401, "lon": -51.931}).json()
    assert r["access"]["status"] == "interruption_confirmed"
    assert r["access"]["label"].startswith("Interruption confirmed by ")
    # Far from any road: nothing demonstrated.
    r = client.get("/api/exposure", params={"lat": -29.58, "lon": -52.08}).json()
    assert r["access"]["status"] == "isolation_not_demonstrated"
    assert r["access"]["label"] == "Isolation not demonstrated"


def test_no_valid_observation_is_not_zero(client, ds):
    # Row 0 is a no-valid band in the fixtures: unknown must not count as dry.
    w, s, e, n = ds.bounds
    r = client.get("/api/exposure", params={"lat": n - 0.0005, "lon": (w + e) / 2}).json()
    assert r["latest"]["state"] == "no_valid_observation"
    assert r["history"]["n"] < r["history"]["total"]
