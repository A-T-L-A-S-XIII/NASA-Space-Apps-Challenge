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


def _town(client, ds, town_id):
    loc = next(l for l in ds.localities["items"] if l["locality_id"] == town_id)
    return client.get("/api/exposure", params={"lat": loc["lat"], "lon": loc["lon"]}).json()


@pytest.mark.parametrize("town_id, status, label", [
    ("test-town-a", "section_requiring_verification", "Section requiring verification"),
    ("test-town-b", "no_path_under_modeled_conditions", "No path under modeled conditions"),
    ("test-town-c", "isolation_not_demonstrated", "Isolation not demonstrated"),
    ("test-town-d", "interruption_confirmed", "Interruption confirmed by DEV FIXTURE bulletin at "),
])
def test_access_rules(client, ds, town_id, status, label):
    a = _town(client, ds, town_id)["access"]
    assert a["status"] == status
    assert a["label"].startswith(label)
    assert a["exits"] >= 1


def test_town_is_not_on_water(client, ds):
    # The access cases are only meaningful if the towns themselves are dry.
    for t in ("test-town-a", "test-town-b", "test-town-c", "test-town-d"):
        assert _town(client, ds, t)["latest"]["state"] == "no_candidate_water"


def test_no_exits_gives_coverage_warning(client):
    # Far from every test road.
    r = client.get("/api/exposure", params={"lat": -29.58, "lon": -52.08}).json()
    assert r["access"]["status"] == "isolation_not_demonstrated"
    assert r["access"]["exits"] == 0 and r["access"]["coverage_warning"]


def test_no_valid_observation_is_not_zero(client, ds):
    # Row 0 is a no-valid band in the fixtures: unknown must not count as dry.
    w, s, e, n = ds.bounds
    r = client.get("/api/exposure", params={"lat": n - 0.0005, "lon": (w + e) / 2}).json()
    assert r["latest"]["state"] == "no_valid_observation"
    assert r["history"]["n"] < r["history"]["total"]
