"""Write the JSON Schemas of the data contract to docs/contract/.

    python backend/export_schemas.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.schemas import Exposure, LayerSet, Localities, Stats, Timeline  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "contract"

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, model in [("timeline", Timeline), ("layers", LayerSet), ("exposure", Exposure),
                        ("stats", Stats), ("localities", Localities)]:
        (OUT / f"{name}.schema.json").write_text(
            json.dumps(model.model_json_schema(), indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote docs/contract/{name}.schema.json")
