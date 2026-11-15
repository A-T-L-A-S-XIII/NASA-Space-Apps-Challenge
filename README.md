# Water Waltz

NASA Space Apps 2026 · Challenge "Dancing with the SARs" · Local Event: Goiânia

> **Prototype.** The Taquari Valley screens show the 19 processed NISAR passes; the globe and the region drill-down use simulated values, labelled "simulado" on screen.
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
Browser ──► Next.js (frontend/, Vercel) ──► FastAPI (backend/, Render)
            serves the static mockup         NISAR passes (Fotos/nisar_taquari_50),
            /api/auth/* login bridge         ASF scenes, NOAA ONI, Open-Meteo forecast,
            rewrites the other /api/*        IBGE municipalities, demo account (SQLite)
```

- The browser only talks to Next.js and only sees relative `/api/...` paths.
- Next.js keeps the login token in an httpOnly cookie (`ww_token`) and adds it as `Authorization` when it
  forwards `/api/*` to FastAPI (`frontend/middleware.js`, `frontend/lib/auth.mjs`). The FastAPI address is the
  server-side variable `API_URL`.
- If FastAPI is unreachable, the demo e-mail can still log in to an offline session and the Taquari Valley
  screens read saved copies in `frontend/public/data/fallback/`.
- `pipeline/` and `backend/scripts/` are Python scripts run beforehand on our computers; the API does no
  radar processing.

## NASA data used

NISAR L2 GCOV, the only source of candidate water. A search of NASA's catalogue (`pipeline/query.py`, result in `data/nisar_granules.json`) found 21 images since June 2026 covering our area, on two orbits that repeat every 12 days. The granules used are listed in [docs/DATA.md](docs/DATA.md).

## Other data (context only)

- **Basemap:** tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), used under the OpenStreetMap tile usage policy (attribution always visible, no stored or offline tiles).
- **Roads:** OpenStreetMap main roads (motorway to tertiary) inside the study area, extracted with `pipeline/fetch_roads.py` (OSM data timestamp in `data/roads/osm_roads.geojson`). Road data © OpenStreetMap contributors, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). The road file is derived from OSM and is under the ODbL, not under the MIT licence of the code.
- **Localities:** IBGE municipal seats and localities *[to add; product, version and licence to verify]*.

## How to run

First time only: copy the config templates, then set `DEMO_USER_PASSWORD` and `JWT_SECRET` in `backend/.env`
(the demo account password is whatever you put there; never commit it).

```bash
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
```

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Then run each service in its own terminal.

**Terminal 1, FastAPI** (from `backend/`, because `.env` is read from the current folder; on Windows use
`.venv\Scripts\python`):

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000
```

**Terminal 2, Next.js:**

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 and log in with `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` from `backend/.env`.

Without internet, start FastAPI with `OFFLINE_MODE=true`: ASF and NOAA answers come from
`backend/app/data/snapshots/` (refresh them with `python scripts/snapshot.py` from `backend/`).

Tests: `cd backend && python -m pytest` and `cd frontend && npm test`.

### Deploy

**FastAPI on Render** (free plan; the image is the root `Dockerfile`, which includes `Fotos/nisar_taquari_50`):

1. On render.com: **New → Blueprint**, pick this repository. `render.yaml` creates the `water-waltz-api` web
   service; Render generates `JWT_SECRET` and `SEED_GOV_PASSWORD`.
2. When asked, fill in `DEMO_USER_PASSWORD` (keep it out of the repository) and `CORS_ORIGINS` (the Vercel
   URL, e.g. `https://water-waltz.vercel.app`).
3. After the deploy, `https://<service>.onrender.com/health` must answer `{"status":"ok"}`. The demo account is
   created again on every startup from `DEMO_USER_*`.

The free service sleeps after 15 minutes without traffic and takes about a minute to wake up. Railway also
works: **New Project → Deploy from GitHub repo** finds the `Dockerfile`; set the same variables and
**Generate Domain** under Networking.

**Next.js on Vercel:**

1. **Add New → Project**, import this repository, **Root Directory** `frontend`. Framework: Next.js.
2. Environment variables (no `NEXT_PUBLIC_` prefix, they stay on the server): `API_URL` = the Render URL,
   `DEMO_EMAIL` = the same e-mail as `DEMO_USER_EMAIL`, `JWT_EXPIRE_MINUTES=1440`.
3. Deploy. `API_URL` is read at build time by the rewrites in `next.config.js`: after changing it, redeploy.

Before the pitch, see [docs/checklist-pitch.md](docs/checklist-pitch.md).

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
