"""Read-only access to a prepared dataset directory (data/demo or data/fixtures).

The API never processes radar data; it only serves files written offline by
the pipeline.
"""

from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
DEFAULT_DATA_DIR = REPO / "data" / "demo"


class DatasetMissing(RuntimeError):
    pass


class Dataset:
    def __init__(self, root: Path):
        self.root = root
        if not (root / "manifest.json").is_file():
            raise DatasetMissing(
                f"No manifest.json in {root}. Build the demo data, or for development run "
                "`python pipeline/make_dev_fixtures.py` and set TFW_DATA_DIR=data/fixtures."
            )
        self.manifest = self._json("manifest.json")
        self.timeline = self._json("timeline.json")
        self.stats = self._json("stats.json")
        self.localities = self._json("localities.json")
        self.access = self._json("access.geojson") if (root / "access.geojson").is_file() else None
        g = self._json("grid.json")
        self.bounds: list[float] = g["bounds"]
        self.width: int = g["width"]
        self.height: int = g["height"]
        self.states: dict[str, np.ndarray] = {
            d: np.frombuffer(base64.b64decode(s), dtype=np.uint8).reshape(self.height, self.width)
            for d, s in g["dates"].items()
        }

    @property
    def fixture(self) -> bool:
        return bool(self.manifest.get("fixture"))

    def _json(self, name: str):
        return json.loads((self.root / name).read_text(encoding="utf-8"))

    def layer_set(self, date_id: str):
        p = self.root / "layers" / f"{date_id}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None

    def file(self, rel: str) -> Path | None:
        p = (self.root / rel).resolve()
        if self.root.resolve() not in p.parents or not p.is_file():
            return None
        return p


def data_dir() -> Path:
    env = os.environ.get("TFW_DATA_DIR")
    if not env:
        return DEFAULT_DATA_DIR
    p = Path(env)
    return p if p.is_absolute() else REPO / p


@lru_cache(maxsize=4)
def _load(root: str) -> Dataset:
    return Dataset(Path(root))


def get_dataset() -> Dataset:
    return _load(str(data_dir()))
