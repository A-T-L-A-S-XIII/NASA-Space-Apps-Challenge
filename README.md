# Water Waltz

NASA Space Apps 2026 · Challenge "Dancing with the SARs" · Local Event: Goiânia

> **Work in progress.** The map still runs on test data (marked "DEV FIXTURE"; test towns are synthetic). No NISAR result is shown yet.
> Candidate water-change indicator — not a validated flood map. Not for evacuation or route decisions.

## The idea

In recent floods in the Taquari Valley (RS, Brazil), many people were affected without water at their door: the road or bridge to their town was cut. We use **NISAR** radar images to show where water was observed over time, and let a resident save their home and see:

- whether radar saw water there in the latest image, and in how many of the past images;
- how far the nearest water was;
- whether access may be cut ("affected without being flooded").

It only shows what the radar observed. It is not a forecast.

**NISAR detects the water; OpenStreetMap roads and IBGE localities provide context.**

## How it works

```
pipeline/  Python scripts, run once on our computers → data/demo/ (images + numbers)
backend/   FastAPI: serves the files in data/demo/ (no live processing)
frontend/  Next.js: map, timeline, "Is my area affected?"
```

For the public demo, `backend/export_static.py` saves the API answers as JSON files, so the site runs on Vercel without a server.

## NASA data used

NISAR L2 GCOV, the only source of candidate water. A search of NASA's catalogue (`pipeline/query.py`, result in `data/nisar_granules.json`) found 21 images since June 2026 covering our area, on two orbits that repeat every 12 days. The granules used are listed in [docs/DATA.md](docs/DATA.md).

## Other data (context only)

- **Basemap:** tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), used under the OpenStreetMap tile usage policy (attribution always visible, no stored or offline tiles).
- **Roads:** OpenStreetMap main roads (motorway to tertiary) inside the study area, extracted with `pipeline/fetch_roads.py` (OSM data timestamp in `data/roads/osm_roads.geojson`). Road data © OpenStreetMap contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). The road file is derived from OSM and is under the ODbL, not under the MIT licence of the code.
- **Localities:** IBGE municipal seats and localities *[to add; product, version and licence to verify]*.

## How to run

```bash
# test data
python pipeline/make_dev_fixtures.py
python backend/export_static.py --data-dir data/fixtures --allow-fixtures
cd frontend && npm install && npm run dev        # http://localhost:3000

# tests
cd backend && python -m pytest

# API server (optional)
TFW_DATA_DIR=data/fixtures uvicorn app.main:app --app-dir backend --reload
```

Before publishing, `python pipeline/validate_demo.py` must pass: it refuses test data.

## Method and limits

See [docs/METHOD.md](docs/METHOD.md). In short: smooth water looks dark to radar, but shadows and other smooth surfaces do too; wind, cities and flooded vegetation can hide water; not seeing water does not prove there was no flood.

## Future work

Mobile app, news, other regions.

## Team

Marcelo (coordination, deploy), Hugo (backend), Jade (NISAR data), Maju (frontend, submission form), Saulo (pitch, README), Maria Paula (video).

## AI assistance

Portions of this codebase were developed with the assistance of AI coding tools. All code was reviewed, tested and integrated by the team.

## License

MIT
