# Decisions

Status: **decided** (team), **to confirm** (decided with a detail still open), **open**.

## Decided by the team

| ID | Decision |
|---|---|
| D-A | Study area: Taquari Valley, RS; observations since 2025. |
| D-B | NISAR is the core (GCOV). Sentinel-1 only adds dates to the timeline and is always shown separately. |
| D-C | Backend: Python + FastAPI, serving precomputed data only. Frontend: Next.js (React) + TypeScript. |
| D-D | All processing happens offline beforehand; nothing is processed live during the demo. |
| D-E | Out of scope: mobile app and news (future work); government account integration (excluded); AI or trained models (excluded); automatic periodic data agents (dropped). |
| D-F | No attribution of floods to El Niño without a specific study. No "official" wording. No real-time or nowcasting claims. |
| D-G | `ATLAS_XIII.pdf` and `el niño.pdf` are not used until the team checks authorship and permission. |

## Answers of 2026-11-15

| ID | Decision | Status |
|---|---|---|
| D-01 | Main user: the citizen on the main screen ("Is my area affected?"); Civil Defence in the detailed view, with downloads per locality. | decided |
| D-02 | No forecast. Only what was observed: latest state and history *k* of *N*, labelled "Based on past and latest radar observations — not a forecast." Follows the decision of 2026-11-14: NISAR does not do nowcasting (12-day revisit). | decided |
| D-03 | Alerts: in-app pop-up only. Radius X = 500 m by default, user-adjustable from 250 m to 1 km *[to confirm]*. Reasons: the water edge in radar is uncertain by a few pixels; browser GPS errs by tens of metres; radar underestimates water in urban areas (double bounce). The pop-up shows the acquisition date and the delay to the product; if the real delay is unknown it shows "[to verify]", never a guess. | to confirm (range) |
| D-04 | Login: "Continue as demo user", no real accounts. Home only in localStorage; current location from the Geolocation API with permission. No personal data on the server. | decided |
| D-05 | Name: Taquari Flood Watch (provisional; final name to confirm). | to confirm |
| D-06 | AOI: lon −52.10 to −51.70, lat −29.60 to −29.10 (north extended to cover Muçum and the Muçum–Roca Sales–Encantado–Arroio do Meio–Lajeado–Estrela reach). Town coordinates are approximate and must be checked on a map. | decided |
| D-07 | Local Event: Goiânia, Brasília time (BRT, UTC−3). Deadline 2026-11-15 23:59 BRT; first submission saved by 21:59 BRT. Track owners: *[not given]*. | partly open |
| D-08 | Demo: video up to 1 min, target 58 s, real interface, English captions, official guide milestones (0:00 who; 0:02 challenge and why; 0:05 name and slogan; 0:10 how it works with the real app and NISAR's role; 0:20–0:30 the future). Replaces the earlier 30 s / 7-slide plan. Licence: MIT. Hosting: Vercel, static export; public GitHub repository. | decided |
| D-09 | Access data (licences, dates, availability to verify): roads and bridges from OpenStreetMap (ODbL, attribution; bridges `bridge=yes`), optional DNIT (SNV) and DAER-RS. Dated interruptions only from official bulletins with date and time (Defesa Civil RS, DAER-RS or PRF), for one case the team chooses. Hydrological reference: SGB critical-events alert system (Taquari stages at Encantado, Lajeado, Estrela) or ANA HidroWeb, as context, not pixel truth. The SGB bulletin of 2026-11-05 12:00 is cited but still to check. Optional independent check: Copernicus EMS or GFM. | decided (sources to verify) |
| D-10 | Localities: IBGE. Municipal mesh for boundaries, clipped to the AOI; IBGE localities base (seats and districts) for the offline search list. | decided (details during the work) |

## Answers of 2026-11-15, 03:56 BRT (coordinator)

| ID | Decision | Effect |
|---|---|---|
| D-11 | Backend: **keep Hugo's work and fit it into the project backend**. His authentication (SQLite, JWT, seed government account), regions and ASF search were brought from branch `backend` (up to `cf89048`) into `backend/` alongside the radar routes; Hugo continues on the project branch. | Reopens D-04 (demo login only, no personal data on the server) and the "static, no server" part of D-08. |
| D-05 | Name: **Water Waltz** (final). | Renamed in README, NOTICE, LICENSE, app title. |

## Answers of 2026-11-15, second round (coordinator)

| ID | Decision | Effect |
|---|---|---|
| D-12 | Video: up to 1 min. Slides: no limit. | Confirms D-08; checklist updated. |
| D-13 | Login: demo only ("Continue as demo user"). Public site: static, no server. | Confirms D-04 and the static part of D-08 over D-11. Hugo's authentication stays in `backend/` but is not used by the public demo. |
| D-15 | AI use is declared: AI tools were used as coding assistants; all code was reviewed, tested and integrated by the team. | README keeps its "AI assistance" section; the submission form states it too. The checklist scan that required no AI traces was removed. |
| D-14 | Data: only NASA and partner space agencies (e.g. ESA for Sentinel-1). | Reopens D-09 and D-10: OpenStreetMap, IBGE, SGB, ANA, DNIT, DAER-RS, Defesa Civil and Copernicus EMS need a NASA/partner replacement or are removed. |

## Track A findings (2026-11-15, 02:52–03:10 BRT)

- NISAR coverage **confirmed** by a CMR query (`pipeline/query.py`, results in `data/nisar_granules.json`): 21 GCOV granules since 2025, all fully covering the AOI, in two stacks repeating every 12 days:
  - `053_D_103` (descending, track 53, frame 103), ~21:33 UTC;
  - `103_A_163` (ascending, track 103, frame 163), ~09:22 UTC.
- Collections: `NISAR_L2_GCOV_PROVISIONAL_V1` (product version 1.0.11, 2026-06-17 to 2026-10-19) and `NISAR_L2_GCOV_V1` (1.0.20, 2026-10-27 and 2026-10-31). Frequency A HH+HV at 40 MHz; frequency B HH+HV at 5 MHz.
- No granule after 2026-10-31 was in the catalogue at query time, so none covers the period of the SGB bulletin of 2026-11-05.
- Each `.h5` is about 7.0 GB (Content-Length 7,012,876,288 for the 2026-10-27 granule). Downloading or reading **requires Earthdata Login** (HTTP 401 redirect to urs.earthdata.nasa.gov, for both collections). Byte ranges are accepted, so with a token only the AOI subset needs to be read.
- First pair chosen for the chain: same stack and same version, `053_D_103` v1.0.11, 2026-10-03 and 2026-10-15. Pairs across stacks or versions are not compared.

## Technical choices

| ID | Choice | Why |
|---|---|---|
| T-01 | Change compares a date only with the previous date of the **same sensor and stack**. | Different bands, geometries and processing versions would create false change. |
| T-02 | Per-date state grid (0 no valid observation, 1 no candidate water, 2 candidate water) shipped as `grid.json`. | The API and the static demo answer "Is my area affected?" for any point. |
| T-03 | Per-locality statistics: provisional 2 km circle until the IBGE mesh is in. | D-10. |
| T-04 | MapLibre GL, Recharts; one image source per date. | Date changes only flip visibility. |
| T-05 | Static export to `frontend/public/api/`; Next.js `output: "export"`. | Public demo on Vercel with no server and no login. |
| T-06 | TypeScript pinned to 5.9.3. | Next.js build compatibility. |
