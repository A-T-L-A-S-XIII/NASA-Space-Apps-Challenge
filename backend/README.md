# Water Waltz — Backend (FastAPI)

API of **Water Waltz** (NASA Space Apps Challenge 2026, challenge "Dancing with the SARs"):
droughts and floods in the Vale do Taquari (RS, Brazil) with NISAR radar data.

> Candidate water-change indicator from radar: not a validated flood map, not a forecast, and not for
> route or evacuation decisions.

## How to run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # change JWT_SECRET and SEED_GOV_PASSWORD
uvicorn app.main:app --reload
```

- Interactive docs (Swagger): http://localhost:8000/docs
- The **processed radar** routes need a ready dataset. Without `data/demo/` they answer 503. For
  development, build the test data and set the variable **in the environment** (it is not read from
  `.env`):

  ```bash
  pip install -r ../pipeline/requirements.txt
  python ../pipeline/make_dev_fixtures.py
  TFW_DATA_DIR=data/fixtures uvicorn app.main:app --reload
  ```

## Tests

```bash
pip install -r requirements.txt
python -m pytest
```

The tests do not use the internet: ASF and NOAA are replaced by fake responses (`httpx.MockTransport`).

With Docker, without installing anything (from the repository **root**):

```bash
docker build -t water-waltz-api .
docker run --rm water-waltz-api pytest
docker run --rm -p 8000:8000 --env-file backend/.env water-waltz-api
```

## Offline mode (pitch without internet)

1. With internet, save the ASF (NISAR GCOV scenes) and NOAA (ONI) snapshots:

   ```bash
   python scripts/snapshot.py              # or: --products GCOV GUNW
   ```

   They go to `app/data/snapshots/*.json` and are included in the commit and in the Docker image.
2. In `.env`, set `OFFLINE_MODE=true`. The API stops calling ASF and NOAA and reads only the snapshots.
3. Even with `OFFLINE_MODE=false`, if the live call fails and there is a snapshot, it is used. The response
   comes with `"live": false`, `"snapshot_date"` (when the snapshot was saved) and the original `error`.
   Without a snapshot, the behaviour is as before: an empty list or series with `error`.

Run the script again close to the pitch so the data is current.

## Endpoints

| Method | Route | Description | Data |
|---|---|---|---|
| GET | `/health` | API status | — |
| POST | `/api/auth/register` | Public sign-up (always creates `cidadao`) | — |
| POST | `/api/auth/login` | Returns `{access_token, token_type, user}` | — |
| GET | `/api/auth/me` | Logged-in user (header `Authorization: Bearer <token>`) | — |
| POST | `/api/auth/gov-users` | Creates a `governo` user (only for `governo` users) | — |
| GET | `/api/me/city-status` | Citizen: is the sign-up town inside this month's water mask? + active alerts | demo |
| GET | `/api/alerts` | Active alerts (`region_id`, `city_id`; with `city_id` it includes the whole region's alerts). Public | database |
| POST | `/api/alerts` | Creates an alert `{region_id, city_id?, level, title, message}` (only `governo`) | database |
| PATCH | `/api/alerts/{id}` | `{"active": false}` turns the alert off (only `governo`) | database |
| GET | `/api/gov/export/{region_id}.csv` | Timeline as CSV: date, area, anomaly, status, ONI, phase, source (only `governo`) | demo + ONI |
| GET | `/api/regions` | Monitored regions (pilot: `vale-do-taquari`) | fixed |
| GET | `/api/regions/{id}` | Bbox, centre, towns and river course | fixed |
| GET | `/api/regions/{id}/status` | Summary for the main card: water of the month, ENSO and latest NISAR scene | demo + live |
| GET | `/api/regions/{id}/nisar-processed` | NISAR scenes already processed into a real mask (granule, date, track, threshold, area) | **real NISAR** |
| GET | `/api/regions/{id}/recurrence` | "Recurrent or one-off?": masks by class, class of each town and flooded area per month since 2015 (`geometry=false` for the numbers only) | **real Sentinel-1** |
| GET | `/api/regions/{id}/scenes` | NISAR scenes from ASF (`start`, `end`, `product=GCOV`, `limit=25`) | **live** |
| GET | `/api/regions/{id}/timeline` | Monthly series: area, anomaly, status, ONI and ENSO phase (`start=2022-01`, `end`) | demo + live ONI |
| GET | `/api/regions/{id}/water-mask` | GeoJSON of the water mask (`date=YYYY-MM`), area and towns reached | demo |
| GET | `/api/regions/{id}/water-mask/frames` | All months at once (`start=2022-01`, `end`; max. 120), simplified geometry | demo |
| GET | `/api/regions/{id}/compare` | Before/after (`before`, `after`), delta, sentence and `browse_url` of the nearest NISAR scene | demo + ASF |
| GET | `/api/regions/{id}/forecast` | Daily weather forecast: rain, chance and temperature (`days=7`, up to 16). Not a flood forecast | **live** (Open-Meteo) |
| GET | `/api/regions/{id}/passes` | The processed NISAR passes (optional `month=YYYY-MM`): water, above/below normal, track, granule and image URLs | **real NISAR** |
| GET | `/api/regions/{id}/passes/{n}/geojson` | Above- and below-normal polygons of one pass, with area in km² (UTM) | **real NISAR** |
| GET | `/api/regions/{id}/municipalities` | Above- and below-normal area by municipality in the month (`month=YYYY-MM`), by each polygon's centroid | **real NISAR** + IBGE |
| GET | `/api/regions/{id}/municipalities/geojson` | IBGE municipal mesh | IBGE |
| GET | `/api/regions/{id}/export` | File with the passes (`format=json\|csv\|geojson`, optional `month`), with provenance and no user data | **real NISAR** |
| GET | `/api/static/nisar/{folder}/{miniatura.png\|slide.png}` | Pass images (the URLs come in `/passes`) | **real NISAR** |
| GET | `/api/places?q=` | Search of municipalities (IBGE, local) and neighbourhoods (Nominatim, from 3 letters); optional `region_id` | IBGE + **live** (OSM) |
| GET | `/api/climate/enso` | NOAA ONI with the phase: El Niño, La Niña or Neutral (optional `start`) | **live** |
| GET | `/api/explain` | Texts for non-specialists (`{id, title, summary, body, icon}`) | fixed |
| GET | `/api/explain/{topic}` | `sar`, `agua-no-radar`, `nisar`, `el-nino`, `la-nina`, `como-ler-o-mapa` | fixed |
| GET | `/api/timeline` | Processed radar dates | processed |
| GET | `/api/layers/{date_id}` | Water and change layers of a date | processed |
| GET | `/api/exposure?lat=&lon=` | "Was my area hit?" for a point | processed |
| GET | `/api/stats` | Water area by date and by locality | processed |
| GET | `/api/localities` | Localities for the search | processed |
| GET | `/api/aoi`, `/api/grid`, `/api/access` | Study area, state grid, roads and bridges | processed |
| GET | `/api/files/{path}` | PNG of a layer | processed |
| GET | `/api/download/{geojson,csv,png}` | Downloads with provenance | processed |

The response shapes are in `app/schemas.py`. For Next.js, the types and a fetch client are in
`frontend-api.ts`.

## What is live, what is demo

| Source | Routes | How |
|---|---|---|
| **ASF DAAC (NISAR)**, live | `/scenes`, `/status`, `/compare` | Public catalogue, no login. 30 min cache. If ASF fails: snapshot with `live: false` and `snapshot_date`; without a snapshot, an empty list and `error`. |
| **NOAA CPC (ONI)**, live | `/climate/enso`, `/timeline`, `/status` | File `oni.ascii.txt`. 6 h cache. If NOAA fails: last cache with `live: false`, else the snapshot, else an empty series with `error`. |
| **DemoProvider**, demo | `/timeline`, `/water-mask`, `/compare`, `/status` | Illustrative, deterministic values with `"source": "demo"` and `"note"`. They follow the real chronology (drought from 2022 to early 2023; floods of Sep 2023, Nov 2023 and May 2024), but **they are not measurements**: NISAR only started operating after 2025. |
| **Open-Meteo**, live | `/forecast` | Weather forecast at the centre of the region, no key. 30 min cache. If it fails: last cache with `live: false`, else `days: []` with `error`; after a failure it waits 5 min before trying again. |
| **Nominatim (OpenStreetMap)**, live | `/places` | Neighbourhoods and streets inside the region box. App User-Agent, at most 1 request per second and 24 h cache. If it fails, the IBGE municipalities still come out and `error` explains. |
| **NISAR passes**, processed beforehand | `/passes`, `/municipalities`, `/export`, `/api/static/nisar` | Reads `Fotos/nisar_taquari_50` (`NISAR_FOTOS_DIR`): `catalogo.json` and, per pass, `area_cheia_seca.geojson`, `miniatura.png` and `slide.png`, with `"source": "nisar"`. Without the catalogue, 404. The municipal mesh (`app/data/vale_municipios.geojson`) comes from IBGE via `pipeline/build_vale_municipios.py`. |
| **Sentinel-1**, processed beforehand | `/recurrence` | File built by `scripts/process_sentinel1.py` in Earth Engine, with `"source": "sentinel-1"`. Without the file, 404. |
| **Processed radar** | `/api/timeline`, `/api/layers`... | Files built beforehand by the pipeline in `data/demo/`. With `data/fixtures/`, the responses come with `"fixture": true`. |

Alerts and users are stored in SQLite. At startup, the API creates the seed government account and **2
sample alerts** with `"source": "demo"` and a title starting with `[Exemplo]` (they are not real warnings).
Town ids are the name without accents, with hyphens (`mucum`, `roca-sales`), and appear in
`/api/regions/{id}`. The sign-up `city` is compared the same way, so "Muçum" and "mucum" both work.

In `/compare`, `before.browse_url` and `after.browse_url` are the browse image of the NISAR GCOV scene
closest to the 15th of the month, up to 30 days away; otherwise `null`. For 2022–2024 it is always `null`,
because NISAR was not operating yet.

In the demo mask, the area is computed in UTM (metres), never in degrees. A town counts as reached when the
mask covers at least 30% of a 1 km circle around its centre.

## Deploy (Render or Railway)

The `Dockerfile` is at the repository **root** (the image needs `backend/`, `data/` and `pipeline/`).
The API starts with `uvicorn` on port `$PORT`, which both platforms set on their own.

**Render**

1. *New > Web Service*, connect the repository and choose **Docker** as the runtime.
2. Leave *Root Directory* empty and set *Dockerfile Path* = `./Dockerfile`.
3. In *Environment*, create the variables below. *Health Check Path*: `/health`.

**Railway**

1. *New Project > Deploy from GitHub repo*. Railway finds the root `Dockerfile` on its own.
2. In *Variables*, create the variables below. In *Settings > Networking*, generate a public domain.

**Variables** (never put secrets in the image or in the repository):

| Variable | Value |
|---|---|
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `SEED_GOV_EMAIL`, `SEED_GOV_PASSWORD` | Seed government account (strong password) |
| `CORS_ORIGINS` | URL of the production Next.js app, e.g. `https://water-waltz.vercel.app` (comma for several). The Next server calls the API, not the browser |
| `CORS_ORIGIN_REGEX` | Optional, for Vercel previews: `https://water-waltz.*\.vercel\.app` |
| `OFFLINE_MODE` | `false` (or `true` at the pitch, if the event network is poor) |

Then, in the Vercel project, point the frontend to the API URL (e.g. `https://water-waltz-api.onrender.com`).

Notes:

- SQLite lives inside the container: **accounts and alerts disappear on every deploy or restart**. The seed
  government account and the sample alerts are created again at startup. To keep real data, use a
  persistent disk (Render *Disks*, Railway *Volumes*) with `DATABASE_URL=sqlite:////dados/water_waltz.db`.
- On Render's free plan, the service sleeps without traffic and the first request takes about 1 min. Open
  the API a few minutes before the pitch.
- The **processed radar** routes answer 503 without `data/demo/` (which is not in the repository).

## Real NISAR mask

`scripts/process_nisar.py` builds the mask from a GCOV scene, outside the API:

```bash
pip install -r scripts/requirements-nisar.txt   # asf_search, earthaccess, h5py, rasterio
# in .env: EARTHDATA_USERNAME and EARTHDATA_PASSWORD (free account at urs.earthdata.nasa.gov)
python scripts/process_nisar.py --estimate      # shows the scene and how many MB the subset will download
python scripts/process_nisar.py                 # fixed -18 dB threshold
python scripts/process_nisar.py --method otsu   # or --threshold -16, --pol VV, --granule ...
```

1. Finds the most recent GCOV scene that covers at least 50% of the region bbox. If there is none, it uses
   Guaíba/Porto Alegre and says so.
2. Opens the HDF5 (~7 GB) by **streaming**: only the chunks of the bbox subset are downloaded.
3. Reads the subset in strips and averages 2×2 blocks (`--downsample 2`, from 10 m to 20 m): less noise and
   4× less memory. At native resolution (`--downsample 1`), the Taquari subset has 39 million pixels and can
   exceed the RAM of a 5 GB machine.
4. Converts HH (or VV) to dB, applies the threshold, cleans the noise (3×3 majority and patches smaller than
   1 ha), vectorises with `rasterio.features.shapes`, simplifies and saves
   `app/data/nisar/{region_id}_{YYYY-MM-DD}.geojson` with granule, date, track, threshold and area in km².

The `NisarProvider` (`app/providers/nisar.py`) is the provider for all regions:

- In a month with a processed scene, `/water-mask`, `/compare`, `/timeline` and `/frames` use the real mask
  with `"source": "nisar"` (if there is more than one in the month, the most recent wins).
- The anomaly of the real mask compares only with processed scenes **from the same track** (their median).
  With a single scene, the anomaly is 0 and the status is `normal`.
- In other months, it falls back to the `DemoProvider`, with `"source": "demo"`. If a response mixes both
  (e.g. `/compare` between a demo month and a NISAR month), the overall `source` is `demo`.

Already processed: **31 Oct 2026**, track `103_A_163`, HH, −18 dB threshold, **32.8 km²** of water in the
bbox (about 1.5 min and 400 MB of RAM, downloading ~107 MB of the 6.9 GB file).

Notes:

- The real mask is **all the water** detected in the subset (river, ponds, lakes), not only the river.
  Comparing its area with a demo month makes no sense.
- In urban areas, the radar sees less water than there is. Flooded vegetation can go unnoticed in HH.
- Compare only dates from the **same track and the same product version** (decision T-01).

## Sentinel-1 recurrence ("recurrent or one-off?")

NISAR has Taquari scenes only since 17 Jun 2026, too few to speak of recurrence. The history comes from
**Sentinel-1** (C-band, since 2014), processed once in Google Earth Engine, outside the API:

```bash
pip install -r scripts/requirements-sentinel1.txt   # earthengine-api, rasterio
earthengine authenticate                            # once, opens the browser
# in .env: EE_PROJECT=<id of the Google Cloud project registered in Earth Engine>
python scripts/process_sentinel1.py --estimate      # orbits and number of scenes
python scripts/process_sentinel1.py                 # takes 15 to 30 min
```

1. `COPERNICUS/S1_GRD` scenes (IW, VV) from **a single orbit** (the most frequent: 24, descending).
2. Water in each scene: VV below −18 dB, with a 50 m median against speckle and no slopes above 5° (radar
   shadow on the hills looks like water).
3. **Permanent** = water in at least 50% of the scenes (the riverbed).
4. Outside the riverbed, it counts in how many **different months** each pixel flooded: **one-off** (1),
   **flooded again** (2 to 3) or **recurrent** (4 or more).
5. Downloads the class raster in 16 tiles (the whole map at once exceeds the Earth Engine limit),
   vectorises and saves `app/data/sentinel1/{region_id}_recorrencia.geojson`, with the flooded area of each
   month.

In the `/recurrence` route, each town gets the strongest class that covers at least **10%** of the 1 km
circle around its centre (the monthly mask uses 30%; here it is lower because recurrence usually reaches only
the low part of the town). With nothing above 10%, the class is `sem_registro` ("no record"), which does
**not** mean "never flooded".

Result (orbit 24, 471 scenes from 2015-04-29 to 2026-11-10, 103 months with a pass): one-off 45.3 km², flooded
again 18.8 km², recurrent 53.4 km², permanent 19.4 km². Months with the most flooded area outside the
riverbed: 2026-09 (81.5 km²), 2024-05 (34.8), 2018-10 (33.8), 2016-07 (33.1) and 2020-07 (29.5); 2023-09 had
28.9. The median of an ordinary month is 9.6 km² (the background noise: soaked soil, smooth surfaces).

Notes (it is a recurrence indicator, not an official risk map):

- **Short floods are missed.** The satellite passes every 12 days (only Sentinel-1A since the end of 2021)
  and Taquari floods rise and fall in 2 or 3 days. In the narrow upper valley (Muçum, Encantado, Roca Sales)
  the peak is almost never captured, and every town comes out as `sem_registro`.
- **Towns do not show up.** Between buildings the radar return is strong (double-bounce) and water does not
  look dark.
- **Not everything that floods is a flood.** Irrigated crops (rice) and wetlands in the lower Taquari can fall
  into `recurrent`.

## Next steps: replace the DemoProvider with real NISAR

The water routes talk only to a `WaterProvider` (`app/providers/base.py`), which has two methods:
`water_mask(region, month)` and `baseline(region)`. To use real data:

1. **Process GCOV outside the API** (decision D-D: nothing is processed live), in a `pipeline/` script:
   - Find the GCOV scenes that cover the bbox (`asf_search` or the `/scenes` route already do this).
   - Read only the region subset from the HDF5. Each file is about 7 GB, but the server accepts *byte
     ranges*, so the bbox subset can be read with an Earthdata login.
   - Take the **HH** (or **VV**) backscatter and convert it to dB: `10 * log10(value)`.
   - Detect water with a threshold: start near **−18 dB** (configurable) or compute the threshold by Otsu
     for each scene.
   - Clean noise (median filter, remove small patches), vectorise the mask (`rasterio.features.shapes`),
     simplify and save as GeoJSON with metadata: granule, date, track, threshold and area in km².
2. **Process more scenes.** The `NisarProvider` and the script already exist (section above); what is
   missing is running the script for more dates and calibrating the threshold with known flood scenes.
3. Notes:
   - Compare only dates from the **same track and the same product version** (decision T-01).
   - In urban areas, the radar sees less water than there is.
   - Mark as "no valid observation" what the radar could not measure.

## Conventions

Simple code, API errors in Portuguese (the app shows them in English where it matters) and every simulated
value labelled (`"source": "demo"` or `"fixture": true`). The climate texts speak only of tendencies: no
event is attributed to El Niño or La Niña (decision D-F).
