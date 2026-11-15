"""Respostas do ASF e da NOAA salvas em disco por scripts/snapshot.py.

Servem para o pitch sem internet (OFFLINE_MODE=true) e como plano B quando a
fonte ao vivo falha. Cada arquivo é um JSON com "snapshot_date" e os dados crus.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

ASF_FILE = "asf_scenes.json"
NOAA_FILE = "noaa_oni.json"


def _path(name: str) -> Path:
    return Path(settings.snapshot_dir) / name


def load(name: str) -> dict | None:
    """Conteúdo do snapshot, ou None se o arquivo não existir ou estiver quebrado."""
    try:
        return json.loads(_path(name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save(name: str, data: dict) -> Path:
    path = _path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"snapshot_date": datetime.now(timezone.utc).isoformat(timespec="seconds"), **data}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
