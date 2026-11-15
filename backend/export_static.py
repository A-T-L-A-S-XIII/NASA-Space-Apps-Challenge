"""Export the API responses as static files so the frontend runs on static
hosting with no server (frontend/public/api/).

    python backend/export_static.py                      # data/demo, refuses fixtures
    python backend/export_static.py --data-dir data/fixtures --allow-fixtures   # dev only
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.downloads import stats_csv, stats_geojson  # noqa: E402
from app.services.exposure import compute_exposure  # noqa: E402
from app.services.store import REPO, Dataset  # noqa: E402

OUT = REPO / "frontend" / "public" / "api"


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.environ.get("TFW_DATA_DIR", "data/demo"))
    ap.add_argument("--allow-fixtures", action="store_true", help="development only")
    args = ap.parse_args()
    root = Path(args.data_dir)
    root = root if root.is_absolute() else REPO / root
    ds = Dataset(root)
    if ds.fixture and not args.allow_fixtures:
        print("Refusing to export DEV FIXTURE data. Use real data in data/demo, "
              "or pass --allow-fixtures for local development.", file=sys.stderr)
        return 1

    if OUT.exists():
        shutil.rmtree(OUT)
    dump(OUT / "timeline.json", ds.timeline)
    dump(OUT / "stats.json", ds.stats)
    dump(OUT / "localities.json", ds.localities)
    dump(OUT / "manifest.json", ds.manifest)
    shutil.copy(root / "grid.json", OUT / "grid.json")
    shutil.copy(REPO / "data" / "aoi.geojson", OUT / "aoi.json")
    if ds.access is not None:
        dump(OUT / "access.json", ds.access)
    for e in ds.timeline["entries"]:
        dump(OUT / "layers" / f"{e['date_id']}.json", ds.layer_set(e["date_id"]))
    for png in (root / "layers").glob("*.png"):
        dst = OUT / "files" / "layers" / png.name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(png, dst)
    dump(OUT / "download" / "stats.geojson", stats_geojson(ds))
    (OUT / "download" / "stats.csv").write_text(stats_csv(ds), encoding="utf-8")
    # Reference answers used to check frontend/lib/exposure.ts against the Python service.
    samples = [compute_exposure(ds, l["lat"], l["lon"]).model_dump(mode="json")
               for l in ds.localities["items"]]
    dump(OUT / "exposure-samples.json", samples)
    print(f"Static API written to {OUT}" + (" (DEV FIXTURE)" if ds.fixture else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
