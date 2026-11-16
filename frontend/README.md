# Water Waltz · frontend

Interface for the **Dancing with the SARs** challenge (NASA Space Apps 2026): static HTML/CSS/JS screens in
`public/`, served by a Next.js app that only bridges the login and forwards `/api/*` to FastAPI.
The **Vale do Taquari** screens use the real data from the backend (`backend/`). The globe and the region
drill-down still use demonstration values, labelled "simulated".

## How to run

The first time, copy the configuration templates and change `DEMO_USER_PASSWORD` and `JWT_SECRET` in
`backend/.env` (the demo account password is whatever you put there):

```bash
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
```

Run both servers, each in its own terminal. FastAPI runs from inside `backend/`, because `.env` is read from
the current folder (on Windows, use `.venv\Scripts\python`):

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Then open http://localhost:3000 and log in with `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from
`backend/.env`, or choose **Continue as guest**. Next.js only serves the static screens in `public/` and
forwards `/api/*` to FastAPI (rewrite in `next.config.js`). The FastAPI address comes from `API_URL`, read on
the server (template in `.env.example`; default `http://localhost:8000`). The browser only sees relative paths.

`public/js/api.js` is the only file with `fetch`. The screens still ask for the paths from PR #17
(`/api/nisar/*`, `/api/previsao`, `/api/lugares`); `api.js` calls the routes on `main`
(`/api/regions/vale-do-taquari/passes`, `/municipalities`, `/export`, `/forecast`, `/api/places`…) and returns
the fields with the names the screens use, plus `origem` (`"nisar"`, `"open-meteo"`… or `"local"`).

**Fallback:** with FastAPI down, `api.js` uses `public/data/fallback/` and warns in the console. Forecast,
neighbourhoods, login and downloads need the API. To refresh the files, with FastAPI running:
`node scripts/gerar-fallback.mjs`.

**Forecast:** when the API returns no forecast days (Open-Meteo answers 429 to the shared outgoing IP of the
hosting), `api.js` asks Open-Meteo directly from the browser, with the same parameters. It is still a live
forecast, never a saved copy.

**Login:** there is one account, the demo account, created by FastAPI at startup from `DEMO_USER_*` in
`backend/.env`. The browser talks to the Next bridge (`app/api/auth/login`, `/me`, `/logout`, logic in
`lib/auth.mjs`): the token goes into an httpOnly `ww_token` cookie (SameSite=Lax, Secure in production) and the
page receives only name and town. The other `/api/*` routes get the `Authorization` header from the cookie in
`middleware.js`. The inner screens check the session with `/api/auth/me`; a 401 goes back to the login. The
user's town sets the starting municipality (the region is always `vale-do-taquari`).

**Guest:** "Continue as guest" opens a session only in the browser (`sessionStorage`), with no account,
password or cookie. It works because the data routes the screens use are public.

**Login fallback:** with FastAPI unreachable (the bridge returns 502/504, never 401), only the `DEMO_EMAIL`
e-mail (`.env.local`, read on the server) gets in, in an offline session with a console warning. The password
never reaches the frontend.

**Sign-up (`#/cadastro`):** exists only to show the screen. It validates name, e-mail, password and town and,
when everything is valid, says that sign-up is disabled. It does not call `/api/auth/register`.

## Screens

| Route | Screen |
|---|---|
| `#/cadastro` | Disabled sign-up: same card as the login with name, e-mail, password and a town of the Vale do Taquari. It only validates and informs. |
| `#/login` | Login: map of the North Atlantic in ink on kraft paper. Scrolling or moving the cursor makes each region jump off the paper (Europe → North Atlantic → North America). Validates each field, has a show-password button, logs in through `/api/auth/login` or continues as a guest. |
| `#/inicio` | Tab 1 · Overview: a quarter of the globe, central sentence and a news rail for the region (sample content). |
| `#/explorar/...` | Tab 2 · Explore data: continent, country, state and municipality (simulated values). At state and municipality level a shortcut opens the Vale panel. |
| `#/vale` | **Vale do Taquari** tab, with no button in the top bar. Reached from "Open the Vale do Taquari panel" in Explore data, from "See the passes" in the **Satellite** pill on the Overview, from the In-depth mode notice, or directly at `#/vale`. Content: simplified map, search by town or neighbourhood with the place's situation ("new water nearby", "may be affected") and "Save as my home", the July summary, forecast, the simulated rain scenario, images and access to the detailed data. |
| `#/vale/dados` | **Detailed data**: change map with layers, before × after comparison, timeline of the 19 passes (with playback), flooded area, "two ways to measure", area by municipality, Sentinel-1 history ("recurrent or one-off?"), flooded vegetation, "how the map was made", downloads, export and metadata. |

## Where the data comes from

All routes below are under `R = /api/regions/vale-do-taquari` unless stated otherwise. `public/js/api.js` calls
them (see "How to run").

| Feature | FastAPI route | Data source |
|---|---|---|
| Login | `POST /api/auth/login` (Next bridge) | demo account |
| Simplified map: river, towns, region box | `GET R` | region stored in the backend |
| Municipal mesh on the map | `GET R/municipalities/geojson` | IBGE, built by `pipeline/build_vale_municipios.py` |
| Passes, month summary, comparison and timeline | `GET R/passes` (the 19 passes) | NISAR L2 GCOV, `Fotos/nisar_taquari_50` |
| Change map (above/below normal) | `GET R/passes/{n}/geojson`, `GET R/export?format=geojson&month=` | NISAR, processed beforehand, outside the API |
| Radar image | `/api/static/nisar/...` (addresses come in `R/passes`) | processing files |
| Flooded area by municipality | `GET R/municipalities?month=` | each polygon goes to the municipality by its centre |
| "My home" pass count | `GET R/passes` + `GET R/export?format=geojson` | counted in the browser: passes with water above normal within 3 km |
| Sentinel-1 history | `GET R/recurrence?geometry=false` | Sentinel-1 (ESA), `backend/scripts/process_sentinel1.py` |
| Forecast | `GET R/forecast`, or Open-Meteo directly when the API has no days | Open-Meteo (weather forecast, not a flood forecast) |
| Rain scenario | forecast total + distance to the July water | **simulated**: demonstration thresholds of 30 and 80 mm in 7 days |
| Search by town or neighbourhood | `GET /api/places?q=&region_id=` | IBGE (local) and Nominatim/OpenStreetMap (external) |
| El Niño / La Niña badge | `GET /api/climate/enso` | NOAA ONI; the short explanation text is in `api.js` |
| Export and downloads | `GET R/export?format=json\|csv\|geojson&month=` | NISAR |
| Flooded vegetation | — | **no data**: the scenes are HH only; needs HV and new processing |
| Illustrated image | `assets/img/vale-ilustrado.webp` | illustration made from the radar of 23 Jul |
| Municipality situation | `/api/places` + town centres from `R` + above-normal polygons | computed in the browser |

## Look (`css/tokens.css`)

The look is the original one of the prototype, derived from the references in the project folder: forest
green, earth yellow, mint and kraft paper; Urbanist, Instrument Serif and Dela Gothic One fonts; moss and stone
images. The Vale screens use only these tokens and components. The only new colours are for data: mint for
above normal and rust orange for below normal.

### Login screen

- **Background:** the `--login-gradient` token uses only blues already in the system: `--blue-600`,
  `--indigo-700`, `--deep-900` and a highlight in `--teal-500` (*light mode 1* and *dark mode 1* palettes). On
  top goes the Atlantic map in white ink (`*-ink.webp`), made from the original images.
- **Fonts:** `--font-login-title` is Space Grotesk 700; `--font-login-body` is `"DW Sans", "DM Sans", …`.
  "DW Sans" is not on Google Fonts: if it is installed it is used; otherwise DM Sans, loaded in `index.html`.
- **Logo:** `WW.brand({ variant })` uses the official logo with the background removed. `logo-on-dark.webp`
  comes from `Logo-black.jpeg` (light text) and `logo-on-light.webp` from `Logo-white.jpeg` (dark text). The
  login uses the dark-background variant; the top bar switches with the theme.

### Adaptive motion (`js/modes.js` → `WW.motion`)

- `full` by default. It becomes `reduced` with `prefers-reduced-motion: reduce`, Save-Data or
  `deviceMemory ≤ 2`.
- In `reduced` mode: the cursor does not move the login, there is no per-frame interpolation, the globe does
  not spin and redraws only when something changes, and the parallax and drops on the Overview are off.
- In any mode, the globe and login loops stop when the tab goes to the background.
- All `@keyframes` animate only `transform` and `opacity`. The map notice ring no longer uses `box-shadow`. On
  the login, the drop's trail is drawn once and the drop moves by `transform`; no filter is animated.

### Data modes: Lite and In-depth (`js/modes.js` → `WW.mode`)

- The selector is in the top bar. The choice is saved in the browser (`localStorage: ww-mode`), with the same
  account and login, and the default is **Lite**.
- **Lite:** the everyday interface.
- **In-depth:** adds a technical panel to the Vale screens (coordinate system, covered area, full series of
  the 19 passes with granules, polygons with centroid and municipality, daily forecast series) and the
  **Export data** button.
- **Export** (`WW.exportData`): JSON with the full package (provenance, citation, CRS, units), CSV of the
  passes and CSV of the polygons. The file is built in the browser and reads only public radar fields; no
  account data (name, e-mail, searches, token) goes in.

### Tests

```bash
npm test
```

The tests cover: mode switching (default, persistence, event, invalid value), the export (formats, CSV
escaping, no user data), reduced motion (`prefers-reduced-motion`, Save-Data, memory, `@keyframes` with only
transform/opacity, login and globe rules), the login bridge and guest session, the fallback data, the forecast
fallback, the source tags and ENSO badge, the radar highlight and the simulated rain scenario.
