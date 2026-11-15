import os
import subprocess
import sys
from pathlib import Path

import httpx
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
os.environ["DEMO_USER_NAME"] = "Demo Teste"
os.environ["DEMO_USER_EMAIL"] = "demo@teste.dev"
os.environ["DEMO_USER_PASSWORD"] = "senha-demo-123"
os.environ["DEMO_USER_CITY"] = "Estrela"
os.environ["TFW_DATA_DIR"] = str(FIXTURES)
# Testes nunca usam os snapshots e manchas reais de app/data nem o modo offline do .env
os.environ["OFFLINE_MODE"] = "false"
os.environ["SNAPSHOT_DIR"] = str(REPO / "backend" / "tests" / "_sem_snapshots")
os.environ["NISAR_DIR"] = str(REPO / "backend" / "tests" / "_sem_nisar")
os.environ["SENTINEL1_DIR"] = str(REPO / "backend" / "tests" / "_sem_sentinel1")

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import asf  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def dev_fixtures():
    """Radar tests run on DEV FIXTURE data, regenerated so they never depend on real data."""
    subprocess.run([sys.executable, str(REPO / "pipeline" / "make_dev_fixtures.py")],
                   check=True, capture_output=True)
    yield


@pytest.fixture(autouse=True)
def asf_sem_cenas(monkeypatch):
    """Por padrão o ASF responde sem cenas (nenhum teste usa a internet). Os testes podem trocar."""
    asf.clear_cache()
    monkeypatch.setattr(asf, "_transport", httpx.MockTransport(
        lambda request: httpx.Response(200, json={"type": "FeatureCollection", "features": []})))
    yield
    asf.clear_cache()


@pytest.fixture
def client():
    # Banco limpo a cada teste; o startup recria a conta governo semente e a conta demo
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
