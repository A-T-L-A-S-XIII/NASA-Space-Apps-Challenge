"""Download current OpenStreetMap main roads inside the AOI (D-14, map context only).

Road data © OpenStreetMap contributors, available under the Open Database
License (ODbL): https://www.openstreetmap.org/copyright. The file written here
is derived from OSM and stays under the ODbL, not under the MIT licence.

    python pipeline/fetch_roads.py            # writes data/roads/osm_roads.geojson
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from common import REPO, load_aoi_bbox, now_iso, write_json

OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]  # tried in order
CLASSES = "motorway|trunk|primary|secondary|tertiary"  # main road classes only
OUT = REPO / "data" / "roads" / "osm_roads.geojson"


def main() -> None:
    w, s, e, n = load_aoi_bbox()
    query = f'[out:json][timeout:120];way["highway"~"^({CLASSES})$"]({s},{w},{n},{e});out tags geom;'
    data, errors = None, []
    for url in OVERPASS:
        req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": query}).encode(),
                                     headers={"User-Agent": "water-waltz-hackathon/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            break
        except Exception as exc:  # noqa: BLE001 - report and try the next server
            errors.append(f"{url}: {exc}")
    if data is None:
        raise SystemExit("Overpass unavailable:\n  " + "\n  ".join(errors))

    features = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        t = el.get("tags", {})
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"osm-way-{el['id']}",
                "kind": "bridge" if t.get("bridge") == "yes" else "road",
                "name": t.get("name") or t.get("ref"),
                "highway": t.get("highway"),
                "ref": t.get("ref"),
                "source": "OpenStreetMap",
            },
            "geometry": {"type": "LineString",
                         "coordinates": [[round(p["lon"], 6), round(p["lat"], 6)] for p in el["geometry"]]},
        })

    write_json(OUT, {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "licence": "ODbL — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)",
            "osm_data_timestamp": data.get("osm3s", {}).get("timestamp_osm_base"),
            "downloaded_at": now_iso(),
            "highway_classes": CLASSES.split("|"),
            "bbox": [w, s, e, n],
        },
        "features": features,
    })
    print(f"{len(features)} road segments → {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
