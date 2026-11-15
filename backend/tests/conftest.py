import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "data" / "fixtures"

sys.path.insert(0, str(REPO / "backend"))


@pytest.fixture(scope="session", autouse=True)
def dev_fixtures():
    """Tests run against DEV FIXTURE data, regenerated so they never depend on
    real data being present."""
    subprocess.run([sys.executable, str(REPO / "pipeline" / "make_dev_fixtures.py")],
                   check=True, capture_output=True)
    os.environ["TFW_DATA_DIR"] = str(FIXTURES)
    yield


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
