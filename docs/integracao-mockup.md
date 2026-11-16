# Integration of the mockup (PR #17) with the backend on main

Survey made on the `integracao-mockup` branch (base: `main` at `e6990cf`), with the mockup brought from PR #17
(`new-frontend`, commit `9cef948`). No line of the mockup or of the backend was changed at that step. It is a
historical record: PR #18 then integrated both, and the frontend now calls the routes on `main` (see
`frontend/README.md`).

> **Folders:** the mockup moved to `frontend/` (`git mv mockup frontend`). The old `frontend/` on main
> (Next.js in TypeScript, 17 files) went to `frontend-legado/` (`git mv`), unchanged. The `js/…` paths below
> are inside `frontend/`. The 23 tests passed with `node --test "frontend/tests/*.test.mjs"`.
>
> **Still pointing to the old Next.js in `frontend/`** at that time (left as they were, because that step did
> not change logic): `.gitignore` (`frontend/.next/`, `frontend/out/`, `frontend/next-env.d.ts`,
> `frontend/public/api/`), `.env.example`, `.dockerignore`, `README.md` (structure, `npm run dev`, Vercel
> deploy with Root Directory `frontend`), `docs/DECISIONS.md` (T-05), `backend/export_static.py` (writes to
> `frontend/public/api/`) and comments in `backend/app/schemas.py` (`frontend/lib/types.ts`). Inside the
> mockup, `README.md`, `js/vale.js:154` and `tests/helpers.mjs:1` still mentioned `mockup/`.

Sources read: `backend/app/routers/*`, `backend/app/schemas.py`, `backend/app/config.py`,
`backend/frontend-api.ts` and the `/openapi.json` of main running locally (34 routes). On the mockup side:
`js/api.js`, `js/vale.js`, `js/home.js`, `js/radar-highlight.js`, `js/login.js`, `js/app.js`, `js/modes.js`.
From the PR: `backend/app/routers/nisar.py`, `backend/app/services/nisar.py` and
`backend/app/services/contexto.py`.

## How the mockup talks to the API

- `js/api.js` is the only file with `fetch`. The base came from `?api=` in the URL, from `window.WW_API_BASE`
  or, by default, from `http://localhost:8000`. It cached GETs in memory and sent `Authorization: Bearer` with
  the token from `sessionStorage` (`ww-token`). Today the token lives in an httpOnly cookie (see "Login and
  sign-up in the mockup").
- Besides `fetch`, the mockup builds URLs with `WW.api.url(...)` for `<img src>` and for `download` links.
- Only the Vale screens (`#/vale`, `#/vale/dados`), the **Satellite** pill on the Overview and the login call
  the API. The globe and Explore data (`js/explore.js`, `data/content.js`) use local data labelled
  "simulated".
- CORS: the mockup ran on `http://localhost:5178`. `main` only allowed `http://localhost:3000` by default, so
  5178 had to go into `CORS_ORIGINS` in `.env` (configuration, not code).

## Contract table

Legend for the "On main" column: **=** exists the same · **≈** exists with another shape · **✗** does not
exist.

| # | Mockup call (PR route) | Where | Shape the mockup expects | On main | Shape main returns | Missing or renamed fields |
|---|---|---|---|---|---|---|
| 1 | `POST /api/auth/login` `{email, password}` | `login.js` → `api.login` | `{access_token, user: {name, email, …}}` | **=** `POST /api/auth/login` | `TokenResponse {access_token, token_type, user: UserOut{id, name, email, role, city, created_at}}` | Nothing missing. The mockup uses `access_token`, `user.name` and `user.email`. |
| 2 | `GET /api/regions/vale-do-taquari` | `vale.js` `loadBase` | `{river: {coordinates: [[lon,lat]…]}, cities: [{name, lat, lon}]}` | **=** `GET /api/regions/{region_id}` | `Region {id, name, state, bbox, center, zoom, cities[{id, name, lat, lon}], river{name, coordinates}}` | Nothing missing: main also adds `cities[].id`. |
| 3 | `GET /api/nisar/resumo?mes=2026-07` | `vale.js` (status, area, "two ways", technical panel) | `{mes, mes_nome, passagens, nivel: normal\|atencao\|alagamento\|sem_dados, frase, cheia_km2, seca_km2, pico{data, cheia_km2}\|null, na_janela_da_enchente, por_trilha[{trilha, passagens, agua_min_km2, agua_max_km2}], datas[], area_coberta{oeste, sul, leste, norte}, aviso}` | **≈** `GET /api/regions/{id}/status` (current month) or `GET /api/regions/{id}/timeline` | `RegionStatus {water{date, water_area_km2, anomaly_pct, status: seca\|normal\|alerta\|enchente, event, source, note}, enso, latest_scene, text}`, monthly and with `source: "demo"` | There is no summary of the month's NISAR passes. Missing `passagens`, `cheia_km2`, `seca_km2`, `pico`, `por_trilha`, `datas`, `area_coberta` and `aviso`. `frase` ≈ `text`; `nivel` ≈ `status`, with another vocabulary. Main's numbers are **demo**; the mockup's come from the 19 real passes. |
| 4 | `GET /api/nisar/passagens` and `?mes=` | `vale.js`, `home.js` (Satellite), `radar-highlight.js` | `{mes, meses[], area_coberta{oeste, sul, leste, norte}, itens[{n, data, trilha, pol, passagens_na_orbita, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, limites_leaflet, fonte, granulo, imagens{radar, slide}, geojson}]}` | **≈** `GET /api/regions/{id}/nisar-processed` | `NisarProcessed {region_id, count, scenes[{date, acquisition_time, granule, track, flight_direction, polarization, method, threshold_db, water_area_km2, valid_fraction, scene_coverage, pixel_size_m, bbox, processed_at, file}]}`. Then it had **1 scene** (2026-10-31, built by `scripts/process_nisar.py`), not the 19 in `Fotos/`. | Other names: `data`→`date`, `trilha`→`track`, `pol`→`polarization`, `agua_km2`→`water_area_km2`, `granulo`→`granule`, `limites_leaflet`→`bbox` (other order). Missing `n`, `passagens_na_orbita`, `cheia_km2`, `seca_km2`, `na_janela_da_enchente`, `fonte`, `imagens`, `geojson`, `meses`, `area_coberta` and the `?mes=` filter. |
| 5 | `GET /api/nisar/passagens/{n}/geojson` (`?download=true`) | `radar-highlight.js`, download link in `vale.js` | FeatureCollection; each feature with `properties{classe: cheia\|seca, data, trilha, area_km2}` | **≈** `GET /api/regions/{id}/water-mask?date=YYYY-MM` | `WaterMaskCollection` per **month**, with `properties{date, water_area_km2, anomaly_pct, status, event, source, cidades_atingidas, note}` (one water mask, demo) | No subset per pass and no `cheia`/`seca` classes. Missing `classe`, `trilha` and `area_km2` per polygon, plus `Content-Disposition` with `?download=true`. |
| 6 | `GET /api/nisar/geojson?mes=` (`&download=true`) | `vale.js` `loadBase`, "all of July" download | `{type, mes, fonte, aviso, features[…as in #5]}` | **≈** `GET /api/regions/{id}/water-mask?date=` | same as row 5 | Same as row 5; `mes`→`date`, `fonte`→`source`, `aviso`≈`note`. |
| 7 | `GET /api/nisar/passagens/{n}/imagem/radar` (`miniatura.png`) | `vale.js` (map, comparison, timeline, PNG download), `radar-highlight.js` | 382×496 PNG covering exactly `area_coberta` | **✗** | `/api/files/{path}` only served `layers/*.png` from `data/demo`, which did not exist (503). The `browse_url` of `/compare` points to the ASF image, not to the processed subset. | Whole route. |
| 8 | `GET /api/nisar/passagens/{n}/imagem/slide` (`slide.png`) | `vale.js` (wide figure), `radar-highlight.js` (fixed 1800×1056 boxes) | PNG | **✗** | — | Whole route. |
| 9 | `GET /api/nisar/municipios/geojson` | `vale.js` `loadBase` (mesh on the map) | FeatureCollection with `properties{id, name}` (IBGE) | **✗** | Main had no municipal mesh (`backend/app/data/vale_municipios.geojson` existed only in the PR) | Route and file. |
| 10 | `GET /api/nisar/municipios?mes=` | `vale.js` ("by municipality" table, export) | `{mes, mes_nome, datas[], metodo, fora_dos_municipios{cheia_km2, seca_km2}, municipios[{id, nome, toca_area_coberta, cheia_km2, seca_km2, por_data[{data, cheia_km2, seca_km2}]}]}` | **✗** | The closest is `cidades_atingidas` (names) in water-mask, or `/recurrence` → `cities[]` (Sentinel-1, another question) | Whole route: there was no area by municipality. |
| 11 | `GET /api/nisar/metadados` | `vale.js` (metadata, vegetation, "how it was made"), `home.js` | `{satelite, produto, banda, polarizacao[], fonte, local, area_coberta, periodo{inicio, fim, passagens}, janela_da_enchente{inicio, fim, origem}\|null, trilhas[{trilha, passagens, datas}], classes{cheia, seca}, cuidados[], vegetacao_alagada{disponivel, motivo, requer}, granulos[], municipios_fonte}` | **✗** (only pieces) | Loose parts: `nisar-processed` (granule, track, polarisation), `/api/explain/{topic}` (texts) | Whole route. `vegetacao_alagada` is fixed text in the PR. |
| 12 | `GET /api/previsao` (`?lat&lon&dias`) | `vale.js` (forecast card and technical table) | `{fonte, tipo, lat, lon, gerado_em, chuva_total_mm, frase, dias[{data, chuva_mm, prob_chuva, tmin, tmax}]}` | **✗** | — | Whole route (Open-Meteo). |
| 13 | `GET /api/lugares?q=` | `vale.js` (search) | `{q, itens[{nome, tipo: município\|bairro\|…, lat, lon, dentro_da_area_coberta, fonte}], erro_bairros}` | **≈** `GET /api/localities` | `Localities {fixture, items[{locality_id, name, lat, lon, source}]}`, a fixed list without search; it answered **503** (no `data/demo`) | Missing the `q` search, `tipo`, `dentro_da_area_coberta`, the neighbourhoods (Nominatim) and `erro_bairros`. Other names: `nome`→`name`, `fonte`→`source`, `itens`→`items`. |
| 14 | `GET /api/nisar/exportar?formato=csv&mes=` | download link in `vale.js` | CSV `n, data, trilha, pol, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, granulo, fonte` | **≈** `GET /api/download/csv` or `GET /api/gov/export/{id}.csv` | `/download/csv`: statistics from `data/demo` (503 then). `/gov/export`: demo timeline and **government only** (out of scope). | Whole route, with these columns. |
| 15 | `GET /api/nisar/exportar?formato=json&mes=` | download link in `vale.js` | `{mes, metadados, passagens[], municipios[]}` | **✗** | — | Whole route. |

### Export built in the browser

The **Export data** button of the In-depth mode (`WW.exportData` in `js/modes.js`) has no route of its own:
it builds JSON, a CSV of passes and a CSV of polygons from what rows 4, 6, 10 and 11 already loaded. It works
as soon as those routes exist.

### PR routes the mockup does not call

`GET /api/nisar/passagens/{n}` and `GET /api/nisar/vegetacao-alagada` (answers 501). The mockup reads the
vegetation from inside `metadados`.

## What the mockup used and main did not have

| Feature | In the PR | On main | Status then |
|---|---|---|---|
| **Weather forecast (Open-Meteo)** | `/api/previsao` + `services/contexto.py` + `open_meteo_url`, `forecast_cache_ttl_seconds` and `external_timeout_seconds` in `config.py` | nothing | **missing** |
| **Place search: municipalities (IBGE)** | `/api/lugares`, local search in `vale_municipios.geojson` | `/api/localities` without search, depending on `data/demo` (503) | **missing** |
| **Place search: neighbourhoods (Nominatim)** | `/api/lugares`, Nominatim limited to 1 request/s, User-Agent and 24 h cache; `nominatim_url` in config | nothing | **missing** |
| **Area by municipality** | `/api/nisar/municipios` + IBGE mesh (`vale_municipios.geojson`, built by `pipeline/build_vale_municipios.py`) | nothing; only names in `cidades_atingidas` (demo) | **missing**, including the mesh |
| **JSON export** | `/api/nisar/exportar?formato=json` | nothing | **missing** |
| **CSV export** | `/api/nisar/exportar?formato=csv` | `/api/download/csv` (other content, 503 then) and `/api/gov/export/{id}.csv` (government, out of scope) | **missing** with these columns |
| **GeoJSON export** | `/api/nisar/passagens/{n}/geojson?download=true` and `/api/nisar/geojson?mes=&download=true` | `/api/download/geojson` (statistics from `data/demo`, 503) and `/water-mask` (demo, no `Content-Disposition`) | **missing** per pass and per month with above/below normal |
| **`miniatura.png` image** (radar) | `/api/nisar/passagens/{n}/imagem/radar` | nothing | **missing** |
| **`slide.png` image** | `/api/nisar/passagens/{n}/imagem/slide` | nothing | **missing** |
| **`animacao.gif`** | in `Fotos/` | in `Fotos/` | **nobody uses it**: neither the PR backend nor the mockup. The timeline is animated in the browser by switching the `miniatura.png` files. The same goes for `mosaico_50.png` and `serie_temporal.png`. |
| **The 19 NISAR passes (`Fotos/nisar_taquari_50`)** | read by the API (`services/nisar.py`) | files in the repository, but the API did not read them (`backend/PENDENCIAS.md` listed this) | **missing** to serve |
| **Above/below-normal classes per polygon** | `area_cheia_seca.geojson` of each pass | only one water mask per month (demo or the 2026-10-31 scene) | **missing** |
| **Month summary with sentence and level** | `/api/nisar/resumo` | `/status` and `/timeline` (demo, per month) | **missing** for the real passes |
| **Processing metadata** | `/api/nisar/metadados` | nothing consolidated | **missing** |
| **Covered area (`area_coberta`)** | derived from `limites_leaflet` in the catalogue | did not exist; the region `bbox` is larger (−29.85 to −29.05) | **missing** (the mockup needs it to place the image and the highlighter) |
| **CORS for `localhost:5178`** | default in the PR's `config.py` | only `localhost:3000` + optional regex | **configuration**: `.env` is enough |

### `Fotos/` in the PR and on main

They are **identical**. The `Fotos/` tree has the same hash in both (`c5b16fa`) and
`git diff origin/main pr-17 -- Fotos` shows no difference. There are 82 files. At the root of
`nisar_taquari_50` are `animacao.gif`, `catalogo.csv`, `catalogo.json`, `mosaico_50.png`,
`passagens_puladas.json` and `serie_temporal.png`; the three PNG/GIF files are not used by the PR or by the
mockup. Besides them there are 19 `img_NN_YYYY-MM-DD/` folders, each with `area_cheia_seca.geojson`,
`dados.json`, `miniatura.png` and `slide.png`.

### Other differences in the PR backend (not part of that step)

The PR branched from `ed8a7ea` and, to reach its state, **would delete** from main: alerts, climate/ENSO,
explanations, water (timeline, water-mask, compare), status, Sentinel-1 recurrence, snapshots/offline mode,
`frontend-api.ts`, `scripts/process_*.py`, `data/roads/osm_roads.geojson` and about 1,000 lines of tests. It
also reverts the Portuguese `summary`/tags of the OpenAPI. That is why only the `mockup/` folder was brought.

## Login and sign-up in the mockup

- **Account:** one only, the demo account (role `cidadao`), created by FastAPI at startup from
  `DEMO_USER_NAME`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` and `DEMO_USER_CITY` (`ensure_seed_user`). There is
  no government account in the frontend.
- **Next bridge (`frontend/lib/auth.mjs`):** `POST /api/auth/login` calls FastAPI and writes the token to the
  `ww_token` cookie (httpOnly, SameSite=Lax, Secure in production; without "Keep me signed in", a session
  cookie). The response carries only `{ user: { name, city } }`. `GET /api/auth/me` sends
  `Authorization: Bearer` from the cookie. `POST /api/auth/logout` deletes the cookie. With FastAPI
  unreachable the bridge returns 502 (network) or 504 (timeout). The other `/api/*` routes get the
  `Authorization` from the cookie in `frontend/middleware.js`.
- **Login (`js/login.js`):** validates the fields and calls the bridge. 401 → "Wrong e-mail or password." in
  the error area, with focus on it. Below the button: "Continue as guest", "Demo prototype. Use the team
  account or continue as a guest." and "Create account".
- **Guest (`WW.api.visitante()`):** enters with no account and no password, for whoever gets the link to try
  it. The session lives only in `sessionStorage` (`ww-user` = guest, town Lajeado, and `ww-guest`), with no
  cookie or token, and `/api/auth/me` is not called for it. It works because the data routes the screens use
  are public; the ones that need an account (`/api/me/*`, alerts, `/api/gov/*`) are not used by the frontend.
  "Log out" removes the mark.
- **Session (`js/api.js`, `js/app.js`):** `sessionStorage` keeps only name and town (`ww-user`). The inner
  screens call `/api/auth/me` once per page load; 401 goes back to `#/login`. "Log out" calls
  `/api/auth/logout`.
- **Fallback:** with 502/504 on login, only the `DEMO_EMAIL` e-mail (returned by the bridge) gets in, in a
  session marked `ww-offline`, with a console warning. With that session, a 502/504 on `/me` does not log out;
  a 401 always does.
- **Town → region:** the user's town becomes the starting municipality (`valeMunicipios` in
  `data/content.js`); the region is always `vale-do-taquari`.
- **Sign-up (`#/cadastro`):** same card as the login, with name, e-mail, password and town (local select).
  With everything valid it shows, with `role="status"`, "Sign-up is disabled in this demo. Log in with the
  demo account or continue as a guest." and a link to the login. It does not call `/api/auth/register`.
