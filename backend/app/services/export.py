"""Exportação das passagens NISAR processadas em JSON, CSV ou GeoJSON.

Só dados públicos do radar, com procedência. Nenhum dado de usuário (conta,
e-mail, buscas, token) entra no arquivo, e a rota não exige login.
"""

import csv
import io
from datetime import datetime, timezone

from app.services import municipalities
from app.services import passes as passes_service

CSV_FIELDS = ["n", "date", "track", "polarization", "water_km2", "flood_km2", "dry_km2", "in_flood_window",
              "granule", "source"]


def filename(region: dict, month: str | None, ext: str) -> str:
    return f"water-waltz_{region['id']}_nisar_{month or 'todas'}.{ext}"


def provenance(all_passes: list[dict], chosen: list[dict]) -> dict:
    return {
        "satellite": "NISAR (NASA/ISRO)",
        "product": "L2 GCOV (retroespalhamento geocodificado), banda L",
        "data_source": all_passes[0].get("fonte"),
        "crs": "EPSG:4326",
        "units": {"area": "km²"},
        "coverage": passes_service.coverage(all_passes),
        "granules": [{"n": p["n"], "date": p["data"], "track": p["trilha"], "granule": p["granulo"]} for p in chosen],
        "caveats": passes_service.CAVEATS,
    }


def _rows(region: dict, chosen: list[dict]) -> list[dict]:
    rows = []
    for p in chosen:
        row = passes_service.pass_out(region["id"], p)
        row.pop("images")
        row.pop("geojson_url")
        rows.append({**row, "source": passes_service.SOURCE})
    return rows


def as_json(region: dict, all_passes: list[dict], month: str | None) -> dict:
    chosen = passes_service.in_month(all_passes, month)
    by_muni = None
    if month and municipalities.load_mesh() is not None:
        by_muni = municipalities.by_municipality(region, all_passes, month)["municipalities"]
    return {
        "region_id": region["id"],
        "source": passes_service.SOURCE,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "month": month,
        "provenance": provenance(all_passes, chosen),
        "passes": _rows(region, chosen),
        "municipalities": by_muni,
    }


def as_csv(region: dict, all_passes: list[dict], month: str | None) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(_rows(region, passes_service.in_month(all_passes, month)))
    return buf.getvalue()


def as_geojson(region: dict, all_passes: list[dict], month: str | None) -> dict:
    chosen = passes_service.in_month(all_passes, month)
    return {
        "type": "FeatureCollection",
        "region_id": region["id"],
        "source": passes_service.SOURCE,
        "month": month,
        "provenance": provenance(all_passes, chosen),
        "features": [f for p in chosen for f in passes_service.features(region, p)],
    }
