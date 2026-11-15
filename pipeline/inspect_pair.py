"""Inspect two NISAR GCOV files without assuming their internal structure.

Lists every dataset (path, shape, dtype, units, fill value, description),
then compares the grids of the two files by looking for coordinate and
projection datasets by name. The report is written to docs/inspect/.

    python pipeline/inspect_pair.py data/raw/A.h5 data/raw/B.h5
    # remote, reading only the bytes it needs (needs EARTHDATA_TOKEN):
    python pipeline/inspect_pair.py https://...A.h5 https://...B.h5
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import h5py
import numpy as np

from common import REPO

GRID_NAMES = ("xCoordinates", "yCoordinates", "projection", "xCoordinateSpacing",
              "yCoordinateSpacing", "listOfPolarizations", "listOfCovarianceTerms")
ID_NAMES = ("zeroDopplerStartTime", "zeroDopplerEndTime", "trackNumber", "frameNumber",
            "orbitPassDirection", "productVersion", "granuleId", "processingDateTime")


def open_h5(src: str) -> h5py.File:
    if src.startswith("http"):
        import fsspec

        # ASF requires Earthdata Login (checked 2026-11-15: HTTP 401 without it).
        # Byte ranges are accepted, so only the needed parts of the 7 GB file are read.
        token = os.environ.get("EARTHDATA_TOKEN")
        token_file = Path.home() / ".edl_token"
        if not token and token_file.is_file():
            token = token_file.read_text(encoding="utf-8").strip()
        if not token:
            sys.exit("Set EARTHDATA_TOKEN or write the Earthdata Login user token to ~/.edl_token.")
        headers = {"Authorization": f"Bearer {token}"}
        f = fsspec.open(src, "rb", headers=headers, block_size=8 * 2**20).open()
        return h5py.File(f, "r")
    return h5py.File(src, "r")


def short(v) -> str:
    if isinstance(v, bytes):
        v = v.decode(errors="replace")
    if isinstance(v, np.ndarray):
        if v.dtype.kind == "S":
            v = [x.decode(errors="replace") for x in v.ravel()[:8]]
        elif v.size > 6:
            return f"array{v.shape} [{v.ravel()[0]} … {v.ravel()[-1]}]"
        else:
            v = v.tolist()
    s = str(v)
    return s if len(s) < 160 else s[:157] + "…"


def describe(f: h5py.File) -> tuple[list[str], dict[str, dict[str, str]]]:
    lines: list[str] = []
    found: dict[str, dict[str, str]] = {}

    def visit(name, obj):
        if not isinstance(obj, h5py.Dataset):
            return
        a = {k: short(obj.attrs[k]) for k in ("units", "_FillValue", "description", "long_name")
             if k in obj.attrs}
        lines.append(f"/{name}  shape={obj.shape} dtype={obj.dtype} " +
                     " ".join(f"{k}={v!r}" for k, v in a.items()))
        leaf = name.rsplit("/", 1)[-1]
        if leaf in GRID_NAMES or leaf in ID_NAMES:
            val = short(obj[()]) if obj.size <= 64 or obj.ndim == 0 else short(obj[...])
            attrs = {k: short(obj.attrs[k]) for k in obj.attrs}
            found[f"/{name}"] = {"value": val, **attrs}

    f.visititems(visit)
    return lines, found


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    out_dir = REPO / "docs" / "inspect"
    out_dir.mkdir(parents=True, exist_ok=True)
    found_all = []
    for src in sys.argv[1:]:
        name = Path(src.split("?")[0]).stem
        with open_h5(src) as f:
            lines, found = describe(f)
        found_all.append(found)
        report = [f"# {name}", "", "## Datasets", *lines, "", "## Identification and grid"]
        report += [f"{k}: {v}" for k, v in found.items()]
        (out_dir / f"{name}.txt").write_text("\n".join(report), encoding="utf-8")
        print(f"wrote docs/inspect/{name}.txt ({len(lines)} datasets)")

    a, b = found_all
    print("\nGrid comparison (same path in both files):")
    for k in sorted(set(a) & set(b)):
        leaf = k.rsplit("/", 1)[-1]
        if leaf in GRID_NAMES:
            same = a[k]["value"] == b[k]["value"]
            print(f"  {'same' if same else 'DIFF'}  {k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
