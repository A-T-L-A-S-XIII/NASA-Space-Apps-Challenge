import csv
import io


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_timeline_sorted_and_flagged(client):
    t = client.get("/api/timeline").json()
    assert t["fixture"] is True
    times = [e["acquisition_time"] for e in t["entries"]]
    assert times == sorted(times)
    assert {e["sensor"] for e in t["entries"]} <= {"NISAR", "Sentinel-1"}


def test_change_reference_is_same_sensor(client):
    entries = client.get("/api/timeline").json()["entries"]
    by_id = {e["date_id"]: e for e in entries}
    for e in entries:
        if e["reference_date_id"]:
            assert by_id[e["reference_date_id"]]["sensor"] == e["sensor"]


def test_layers_and_png(client):
    entries = client.get("/api/timeline").json()["entries"]
    for e in entries:
        ls = client.get(f"/api/layers/{e['date_id']}").json()
        assert ls["date_id"] == e["date_id"]
        kinds = {l["kind"] for l in ls["layers"]}
        assert "water" in kinds
        assert ("change" in kinds) == (e["reference_date_id"] is not None)
        for l in ls["layers"]:
            r = client.get(f"/api/files/{l['url']}")
            assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert client.get("/api/layers/nope").status_code == 404


def test_files_cannot_escape_dataset(client):
    assert client.get("/api/files/../manifest.json").status_code == 404
    assert client.get("/api/files/layers/..%2F..%2Fmanifest.json").status_code == 404


def test_stats_consistent_with_timeline(client):
    ids = [e["date_id"] for e in client.get("/api/timeline").json()["entries"]]
    s = client.get("/api/stats").json()
    assert [r["date_id"] for r in s["per_date"]] == ids
    for loc in s["per_locality"]:
        assert [r["date_id"] for r in loc["per_date"]] == ids


def test_downloads_carry_provenance(client):
    gj = client.get("/api/download/geojson").json()
    assert gj["provenance"]["fixture"] is True
    assert gj["provenance"]["acquisitions"]
    text = client.get("/api/download/csv").text
    assert text.startswith("# DEV FIXTURE")
    rows = list(csv.reader(io.StringIO("\n".join(l for l in text.splitlines()
                                                 if not l.startswith("#")))))
    assert rows[0][0] == "locality_id" and len(rows) > 1
    first = client.get("/api/timeline").json()["entries"][0]["date_id"]
    assert client.get(f"/api/download/png?date_id={first}").status_code == 200
    assert client.get("/api/download/png").status_code == 422
