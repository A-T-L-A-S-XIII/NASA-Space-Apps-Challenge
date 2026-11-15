"""Query NASA CMR for NISAR GCOV granules intersecting the AOI and record them.

No login is needed to search. Downloading the granules needs Earthdata Login.

    python pipeline/query.py            # writes data/nisar_granules.json
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from common import REPO, load_aoi_bbox, now_iso, write_json

CMR = "https://cmr.earthdata.nasa.gov/search"
KEYWORD = "NISAR GCOV"
SINCE = "2025-01-01T00:00:00Z"


def get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def attrs(umm: dict) -> dict:
    return {a["Name"]: a["Values"][0] for a in umm.get("AdditionalAttributes", []) if a.get("Values")}


def main() -> None:
    w, s, e, n = load_aoi_bbox()
    bbox = f"{w},{s},{e},{n}"
    cols = get(f"{CMR}/collections.json?" + urllib.parse.urlencode(
        {"keyword": KEYWORD, "page_size": 50}))["feed"]["entry"]
    out = {"queried_at": now_iso(), "cmr": CMR, "bbox": bbox, "since": SINCE, "collections": []}
    for c in cols:
        q = urllib.parse.urlencode({"collection_concept_id": c["id"], "bounding_box": bbox,
                                    "temporal": f"{SINCE},", "page_size": 200,
                                    "sort_key": "start_date"})
        items = get(f"{CMR}/granules.umm_json?{q}").get("items", [])
        granules = []
        for it in items:
            u = it["umm"]
            a = attrs(u)
            pts = u["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]["GPolygons"][0]["Boundary"]["Points"]
            lons, lats = [p["Longitude"] for p in pts], [p["Latitude"] for p in pts]
            granules.append({
                "granule_ur": u["GranuleUR"],
                "begin": u["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"],
                "stack_id": a.get("STACK_ID"),
                "direction": a.get("ASCENDING_DESCENDING"),
                "track": a.get("TRACK_NUMBER"),
                "frame": a.get("FRAME_NUMBER"),
                "product_version": a.get("PRODUCT_VERSION"),
                "freq_a_pol": a.get("FREQUENCY_A_POLARIZATION_CONCAT"),
                "freq_a_bandwidth_mhz": a.get("FREQUENCY_A_RANGE_BANDWIDTH"),
                "footprint_bbox": [min(lons), min(lats), max(lons), max(lats)],
                "covers_aoi": min(lons) <= w and max(lons) >= e and min(lats) <= s and max(lats) >= n,
                "h5_url": next((r["URL"] for r in u.get("RelatedUrls", [])
                                if r.get("Type") == "GET DATA" and r["URL"].endswith(".h5")
                                and r["URL"].startswith("https")), None),
            })
        out["collections"].append({"concept_id": c["id"], "short_name": c["short_name"],
                                   "version": c.get("version_id"), "granules": granules})
        print(f"{c['short_name']}: {len(granules)} granules")
    write_json(REPO / "data" / "nisar_granules.json", out)


if __name__ == "__main__":
    main()
