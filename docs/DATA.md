# Data and provenance

Only data actually used is listed as used. Everything else is marked *[to verify]*.

## NISAR (core)

- Product: NISAR L2 GCOV (Geocoded Polarimetric Covariance), frequency A HH+HV. Collections and versions per granule below (from NASA CMR, `pipeline/query.py` → `data/nisar_granules.json`, queried 2026-11-15).
- Access needs Earthdata Login. Portals: ASF Vertex (https://search.asf.alaska.edu/), NASA Earthdata Search (https://search.earthdata.nasa.gov/search). Guide: NISAR Data User Guide (https://nisar-docs.asf.alaska.edu/).
- DOI / citation of the collections: *[to verify]*.

### Granules processed into `Fotos/nisar_taquari_50/` (branch `Fotos`)

Granule IDs, stacks and polarisation are copied from `Fotos/nisar_taquari_50/catalogo.json`; acquisition times, collections and versions from the CMR query. All 19 granules are in the CMR result. Processed area: lat −29.55 to −29.15, lon −52.15 to −51.80 (`limites_leaflet`). Method, threshold, baseline ("normal") and processing date: *[to verify — notebook not in the repository]*. Nine passes of stack `031_A_163` were skipped for low coverage (`passagens_puladas.json`).

| # | Granule | Acquisition start (UTC) | Stack | Pol. used | Collection | Product version |
|---|---|---|---|---|---|---|
| 1 | `NISAR_L2_PR_GCOV_023_053_D_103_4005_DHDH_A_20260617T213352_20260617T213427_P05023_N_F_J_001` | 2026-06-17 21:33:52 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 2 | `NISAR_L2_PR_GCOV_023_103_A_163_4005_DHDH_A_20260621T092228_20260621T092302_P05023_N_F_J_001` | 2026-06-21 09:22:28 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 3 | `NISAR_L2_PR_GCOV_024_053_D_103_4005_DHDH_A_20260629T213351_20260629T213426_P05023_N_F_J_001` | 2026-06-29 21:33:51 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 4 | `NISAR_L2_PR_GCOV_024_103_A_163_4005_DHDH_A_20260703T092227_20260703T092301_P05023_N_F_J_001` | 2026-07-03 09:22:27 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 5 | `NISAR_L2_PR_GCOV_025_053_D_103_4005_DHDH_A_20260711T213351_20260711T213426_P05023_N_F_J_001` | 2026-07-11 21:33:51 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 6 | `NISAR_L2_PR_GCOV_025_103_A_163_4005_DHDH_A_20260715T092226_20260715T092301_P05023_N_F_J_001` | 2026-07-15 09:22:26 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 7 | `NISAR_L2_PR_GCOV_026_053_D_103_4005_DHDH_A_20260723T213350_20260723T213425_P05023_N_F_J_001` | 2026-07-23 21:33:50 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 8 | `NISAR_L2_PR_GCOV_026_103_A_163_4005_DHDH_A_20260727T092225_20260727T092300_P05023_N_F_J_001` | 2026-07-27 09:22:25 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 9 | `NISAR_L2_PR_GCOV_028_053_D_103_4005_DHDH_A_20260816T213349_20260816T213424_P05023_N_F_J_001` | 2026-08-16 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 10 | `NISAR_L2_PR_GCOV_028_103_A_163_4005_DHDH_A_20260820T092224_20260820T092259_P05023_N_F_J_001` | 2026-08-20 09:22:24 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 11 | `NISAR_L2_PR_GCOV_029_053_D_103_4005_DHDH_A_20260828T213349_20260828T213423_P05023_N_F_J_001` | 2026-08-28 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 12 | `NISAR_L2_PR_GCOV_029_103_A_163_4005_DHDH_A_20260901T092224_20260901T092259_P05023_N_F_J_001` | 2026-09-01 09:22:24 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 13 | `NISAR_L2_PR_GCOV_030_053_D_103_4005_DHDH_A_20260909T213349_20260909T213423_P05023_N_F_J_001` | 2026-09-09 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 14 | `NISAR_L2_PR_GCOV_031_053_D_103_4005_DHDH_A_20260921T213349_20260921T213423_P05023_N_F_J_001` | 2026-09-21 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 15 | `NISAR_L2_PR_GCOV_031_103_A_163_4005_DHDH_A_20260925T092224_20260925T092259_P05023_N_F_J_001` | 2026-09-25 09:22:24 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 16 | `NISAR_L2_PR_GCOV_032_053_D_103_4005_DHDH_A_20261003T213349_20261003T213423_P05023_N_F_J_001` | 2026-10-03 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 17 | `NISAR_L2_PR_GCOV_032_103_A_163_4005_DHDH_A_20261007T092224_20261007T092259_P05023_N_F_J_001` | 2026-10-07 09:22:24 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 18 | `NISAR_L2_PR_GCOV_033_053_D_103_4005_DHDH_A_20261015T213349_20261015T213423_P05023_N_F_J_001` | 2026-10-15 21:33:49 | 053_D_103 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |
| 19 | `NISAR_L2_PR_GCOV_033_103_A_163_4005_DHDH_A_20261019T092224_20261019T092259_P05023_N_F_J_001` | 2026-10-19 09:22:24 | 103_A_163 | HH | NISAR_L2_GCOV_PROVISIONAL_V1 | 1.0.11 |

## Sentinel-1 (complement)

- Product (RTC or GRD) and source (ASF or Copernicus): *[to verify]*.

| Granule | Acquisition (UTC) | Product | Citation | Accessed | SHA-256 |
|---|---|---|---|---|---|
| — none downloaded yet — | | | | | |

## Other data (for "affected without being flooded")

Road network, bridges, dated interruptions, hydrological reference: *[to choose — docs/DECISIONS.md D-09]*.
Locality list and boundaries: *[to choose — D-10]*.

## Development fixtures

`pipeline/make_dev_fixtures.py` writes synthetic **DEV FIXTURE** data to `data/fixtures/` (git-ignored). It is not a result. Locality points in it are approximate and must be replaced by an official source.

## Reproducing the demo data

Raw products go to `data/raw/` (git-ignored). The README explains how to obtain them; `data/demo/manifest.json` lists the SHA-256 of every demo file, checked by `python pipeline/validate_demo.py`.
