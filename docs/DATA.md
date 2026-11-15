# Data and provenance

Only data actually used is listed as used. Everything else is marked *[to verify]*.

## NISAR (core)

- Product: GCOV. Level, collection, version, maturity, polarisation and file structure: *[to verify]*.
- At least two distinct, comparable acquisitions are required.
- Portals: ASF Vertex (https://search.asf.alaska.edu/), NASA Earthdata Search (https://search.earthdata.nasa.gov/search). Guide: NISAR Data User Guide (https://nisar-docs.asf.alaska.edu/).
- Whether `asf_search` supports NISAR, and how it authenticates: *[to verify]*. If not, queries are made in the portals and recorded below.

| Granule | Acquisition (UTC) | Product / version | DOI / citation | Accessed | SHA-256 |
|---|---|---|---|---|---|
| — none downloaded yet — | | | | | |

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
