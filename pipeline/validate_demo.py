"""Gate for the demo build. Fails (exit 1) if the demo data is missing,
inconsistent, tampered with, or contains any DEV FIXTURE.

The demo serves the 19 processed NISAR passes in Fotos/nisar_taquari_50
(read by backend/app/services/passes.py) and the IBGE mesh in
backend/app/data/vale_municipios.geojson. Those are always checked, and the
static site in frontend/public is scanned for fixtures. The older radar routes
read data/demo, which is not in the repository; it is checked only when present.

    python pipeline/validate_demo.py
    python pipeline/validate_demo.py --static frontend/public/api   # also an export
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import REPO, sha256

FIXTURE_MARKERS = ("DEV FIXTURE", "DEV-FIXTURE", '"fixture": true', '"fixture":true')


def scan_for_fixtures(root: Path, errors: list[str]) -> None:
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in (".json", ".geojson", ".csv"):
            text = p.read_text(encoding="utf-8", errors="replace")
            for m in FIXTURE_MARKERS:
                if m in text:
                    errors.append(f"fixture marker {m!r} in {p.relative_to(REPO)}")
                    break
        elif p.is_file() and p.suffix == ".png":
            if b"DEV FIXTURE" in p.read_bytes():
                errors.append(f"fixture marker in {p.relative_to(REPO)}")


def check_demo(root: Path, errors: list[str]) -> None:
    mf = root / "manifest.json"
    if not mf.is_file():
        errors.append(f"missing {mf.relative_to(REPO)}")
        return
    manifest = json.loads(mf.read_text(encoding="utf-8"))
    if manifest.get("fixture") is not False:
        errors.append("manifest.fixture must be false")
    for rel, digest in manifest.get("files", {}).items():
        p = root / rel
        if not p.is_file():
            errors.append(f"manifest lists missing file {rel}")
        elif sha256(p) != digest:
            errors.append(f"hash mismatch for {rel}")
    for req in ("timeline.json", "grid.json", "stats.json", "localities.json"):
        if not (root / req).is_file():
            errors.append(f"missing {req}")
    if errors:
        return
    tl = json.loads((root / "timeline.json").read_text(encoding="utf-8"))
    grid = json.loads((root / "grid.json").read_text(encoding="utf-8"))
    nisar = [e for e in tl["entries"] if e["sensor"] == "NISAR"]
    if len({e["acquisition_time"] for e in nisar}) < 2:
        errors.append("need at least two distinct NISAR acquisitions")
    if len({e["granule_id"] for e in nisar}) != len(nisar):
        errors.append("the same NISAR granule appears as more than one date")
    for e in tl["entries"]:
        if e["date_id"] not in grid["dates"]:
            errors.append(f"grid has no state for {e['date_id']}")
        if not (root / "layers" / f"{e['date_id']}.json").is_file():
            errors.append(f"missing layers/{e['date_id']}.json")
    if not manifest.get("products"):
        errors.append("manifest.products is empty: record the products actually read")


PASS_FIELDS = ("n", "data", "trilha", "pol", "agua_km2", "cheia_km2", "seca_km2",
               "na_janela_da_enchente", "limites_leaflet", "fonte", "granulo")
PASS_FILES = ("area_cheia_seca.geojson", "dados.json", "miniatura.png", "slide.png")


def check_passes(root: Path, errors: list[str]) -> None:
    cat = root / "catalogo.json"
    if not cat.is_file():
        errors.append(f"missing {cat.relative_to(REPO)}")
        return
    passes = json.loads(cat.read_text(encoding="utf-8"))
    if not isinstance(passes, list) or len(passes) < 2:
        errors.append("catalogo.json needs at least two NISAR passes")
        return
    for p in passes:
        missing = [f for f in PASS_FIELDS if f not in p]
        if missing:
            errors.append(f"pass {p.get('n')} lacks {', '.join(missing)}")
            continue
        if not p["granulo"].startswith("NISAR_"):
            errors.append(f"pass {p['n']} granule is not a NISAR product: {p['granulo']}")
        folder = root / f"img_{p['n']:02d}_{p['data']}"
        for f in PASS_FILES:
            if not (folder / f).is_file():
                errors.append(f"missing {folder.relative_to(REPO)}/{f}")
    if len({p.get("granulo") for p in passes}) != len(passes):
        errors.append("the same NISAR granule appears as more than one pass")
    if len({p.get("data") for p in passes}) < 2:
        errors.append("need at least two distinct NISAR acquisition dates")


def check_mesh(path: Path, errors: list[str]) -> None:
    if not path.is_file():
        errors.append(f"missing {path.relative_to(REPO)}")
        return
    if not json.loads(path.read_text(encoding="utf-8")).get("features"):
        errors.append(f"{path.relative_to(REPO)} has no features")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--passes-dir", default=str(REPO / "Fotos" / "nisar_taquari_50"))
    ap.add_argument("--data-dir", default=str(REPO / "data" / "demo"),
                    help="legacy radar dataset, checked only if it exists")
    ap.add_argument("--static", help="also scan a static export directory")
    args = ap.parse_args()
    passes = Path(args.passes_dir).resolve()
    errors: list[str] = []
    check_passes(passes, errors)
    scan_for_fixtures(passes, errors)
    check_mesh(REPO / "backend" / "app" / "data" / "vale_municipios.geojson", errors)
    scan_for_fixtures(REPO / "frontend" / "public", errors)
    root = Path(args.data_dir).resolve()
    if root.is_dir():
        check_demo(root, errors)
        scan_for_fixtures(root, errors)
    if args.static:
        scan_for_fixtures(Path(args.static).resolve(), errors)
    if errors:
        print("validate_demo: FAILED")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("validate_demo: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
