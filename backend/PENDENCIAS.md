# Backend backlog

What was left for later. When an item is done, delete it here (or mark it `[x]`).

## Data

### Sentinel-1 history (done, partly used in the frontend)

- [x] Script `scripts/process_sentinel1.py` (Earth Engine) and route `GET /api/regions/{id}/recurrence`.
- [ ] Show in the frontend: class layer on the map. (The class of each town and the monthly series are on the
  detailed data screen since PR #24.)
- [ ] Check the result against the known floods (Sep 2023, Nov 2023, May 2024) and adjust the threshold if
  needed.

### Serve the processed NISAR passes (`Fotos/nisar_taquari_50/`) (done)

- [x] Routes that serve the 19 processed passes (PR #18): `GET /api/regions/{id}/passes`,
  `/passes/{n}/geojson`, images, municipalities and export, read by `app/services/passes.py`.
- **Note 1:** the water area depends on the track (orbit). `053_D` measures 1 to 5 km² and `103_A` measures
  7 to 9 km², on the same river. Compare only dates from the **same track**.
- **Note 2:** the processed area runs from −29.15 to −29.55 latitude, roughly from Muçum to Lajeado.
  Estrela, Bom Retiro do Sul and Taquari are left out.
- **Open:** where the method, the threshold and the "flood window" (2026-07-03 to 2026-08-28) of the
  catalogue come from. The notebook that produced `Fotos/` is not in the repository; the origin of the
  granules is documented in PR #11 (`docs/DATA.md`).

### Drought and flood routes

- [x] The "recurrent or one-off?" of the history is served by `/recurrence`.
- [ ] Add the NISAR detail (the 19 passes) to the same response, if there is time. Every simulated value must
  carry `"source": "demo"`.

## Scope: government account and alerts (waiting for a team decision)

The app has one account, the demo account (`DEMO_USER_*`), plus guest access, and shows no alerts. The
backend still has what was left from the version with a government role. The frontend uses none of it;
nothing was removed until the team decides.

- [ ] Decide whether to remove or keep:
  - the seed government account (`ensure_seed_gov`, `SEED_GOV_*` in `.env` and `config.py`);
  - `require_gov` and the route `POST /api/auth/gov-users`;
  - the alerts: `GET /api/alerts`, create and turn off an alert, `GET /api/gov/export/{region_id}.csv`,
    `GET /api/me/city-status` and the sample alerts (`ensure_demo_alerts`);
  - the public sign-up `POST /api/auth/register` (the sign-up screen does not call it).
- [ ] If removed: also delete the tests (`test_alerts.py`, the government ones in `test_auth.py`), the
  `SEED_GOV_*` variables in `conftest.py` and `.env.example`, and the mentions in the root guide and in
  `docs/`.

## Security (before publishing the API)

- [x] Change `JWT_SECRET` and `SEED_GOV_PASSWORD` in the local `.env`.
- [ ] Set `JWT_SECRET`, `SEED_GOV_EMAIL`, `SEED_GOV_PASSWORD` and `CORS_ORIGINS` on the host when publishing.
- [ ] Set the demo account on the host (`DEMO_USER_NAME`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`,
  `DEMO_USER_CITY`), with a strong password. In Next (Vercel): `API_URL`, `DEMO_EMAIL` (same as
  `DEMO_USER_EMAIL`) and `JWT_EXPIRE_MINUTES` (same as the backend).
- [ ] Persistent database in the deploy: today the container's SQLite disappears on every deploy (accounts and
  alerts).
- [ ] Run a security review (login, tokens, CORS).

## Small fixes

- [ ] The e-mail of the seed government account (`SEED_GOV_EMAIL`) does not pass the validator. With a
  reserved domain (e.g. `.test`), the account is created but cannot log in.
- [ ] `data_maturity` is `null` for scenes of the `NISAR_L2_GCOV_V1` collection, because ASF does not report
  the maturity.
- [ ] Replace `httpx` with `httpx2` in the tests (warning that `httpx` is deprecated in Starlette's
  TestClient).

## Repository

- [x] Backend integrated into the project (branch `teste-agente`, PR #1, merged).
- [x] Branch `integracao-mockup` (login through the Next bridge, demo account, sign-up disabled): merged in
  PR #18.
- [x] PR #10 (branch `backend` → `main`) and PRs #11 to #15 merged.
- [x] PRs #16 and #17 closed: the #17 mockup came in through #18.
- [x] Branch `teste-agente` deleted.
- [ ] Delete the `nisar-import` branch (split into PRs #11 to #15).
