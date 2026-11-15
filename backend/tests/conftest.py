import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "data" / "fixtures"
sys.path.insert(0, str(REPO / "backend"))

# Configura o ambiente de teste ANTES de importar o app
os.environ["DATABASE_URL"] = "sqlite:///./test_water_waltz.db"
os.environ["JWT_SECRET"] = "chave-de-teste-com-pelo-menos-32-bytes!!"
os.environ["SEED_GOV_EMAIL"] = "gov@teste.dev"
os.environ["SEED_GOV_PASSWORD"] = "senha-gov-123"
os.environ["TFW_DATA_DIR"] = str(FIXTURES)

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def dev_fixtures():
    """Radar tests run on DEV FIXTURE data, regenerated so they never depend on real data."""
    subprocess.run([sys.executable, str(REPO / "pipeline" / "make_dev_fixtures.py")],
                   check=True, capture_output=True)
    yield


@pytest.fixture
def client():
    # Banco limpo a cada teste; o startup recria a conta governo semente
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def register(client, email="ana@exemplo.com", password="senha123", **extra):
    body = {"name": "Ana", "email": email, "password": password, **extra}
    return client.post("/api/auth/register", json=body)


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}
