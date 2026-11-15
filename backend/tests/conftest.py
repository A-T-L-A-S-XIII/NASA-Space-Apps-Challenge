import os

import pytest
from fastapi.testclient import TestClient

# Configura o ambiente de teste ANTES de importar o app
os.environ["DATABASE_URL"] = "sqlite:///./test_water_waltz.db"
os.environ["JWT_SECRET"] = "chave-de-teste-com-pelo-menos-32-bytes!!"
os.environ["SEED_GOV_EMAIL"] = "gov@teste.dev"
os.environ["SEED_GOV_PASSWORD"] = "senha-gov-123"

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


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
