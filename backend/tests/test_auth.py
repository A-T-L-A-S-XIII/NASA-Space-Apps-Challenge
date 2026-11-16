from tests.conftest import auth_header, login, register


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_cadastro_cria_cidadao(client):
    r = register(client, city="Lajeado")
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "ana@exemplo.com"
    assert data["role"] == "cidadao"
    assert data["city"] == "Lajeado"
    assert "password_hash" not in data


def test_cadastro_ignora_role_governo(client):
    r = register(client, role="governo")
    assert r.status_code == 201
    assert r.json()["role"] == "cidadao"


def test_cadastro_email_duplicado(client):
    register(client)
    r = register(client)
    assert r.status_code == 409
    assert r.json()["detail"] == "E-mail já cadastrado"


def test_login_ok(client):
    register(client)
    r = login(client, "ana@exemplo.com", "senha123")
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["role"] == "cidadao"


def test_login_senha_errada(client):
    register(client)
    r = login(client, "ana@exemplo.com", "errada123")
    assert r.status_code == 401
    assert r.json()["detail"] == "E-mail ou senha incorretos"


def test_me(client):
    register(client)
    token = login(client, "ana@exemplo.com", "senha123").json()["access_token"]
    r = client.get("/api/auth/me", headers=auth_header(token))
    assert r.status_code == 200
    assert r.json()["email"] == "ana@exemplo.com"


def test_me_sem_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["detail"] == "Não autenticado"


def test_me_token_invalido(client):
    r = client.get("/api/auth/me", headers=auth_header("token-falso"))
    assert r.status_code == 401


def test_cidadao_recebe_403_em_gov_users(client):
    register(client)
    token = login(client, "ana@exemplo.com", "senha123").json()["access_token"]
    body = {"name": "Novo Gov", "email": "novo@gov.dev", "password": "senha123"}
    r = client.post("/api/auth/gov-users", json=body, headers=auth_header(token))
    assert r.status_code == 403
    assert r.json()["detail"] == "Apenas usuários do governo podem fazer isso"


def test_governo_semente_cria_outro_governo(client):
    r = login(client, "gov@teste.dev", "senha-gov-123")
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "governo"
    token = r.json()["access_token"]

    body = {"name": "Novo Gov", "email": "novo@gov.dev", "password": "senha123"}
    r = client.post("/api/auth/gov-users", json=body, headers=auth_header(token))
    assert r.status_code == 201
    assert r.json()["role"] == "governo"


def test_conta_demo_criada_no_startup(client):
    r = login(client, "demo@teste.dev", "senha-demo-123")
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["role"] == "cidadao"
    assert user["name"] == "Demo Teste"
    assert user["city"] == "Estrela"


def test_conta_demo_nao_duplica(client):
    from app.config import settings
    from app.db import SessionLocal, User
    from app.services.users import ensure_seed_user
    from sqlalchemy import func, select

    with SessionLocal() as db:
        ensure_seed_user(db, "Outro", settings.demo_user_email, "outra-senha", role="cidadao")
        assert db.scalar(select(func.count()).select_from(User).where(User.email == settings.demo_user_email)) == 1
    # a senha original continua valendo
    assert login(client, "demo@teste.dev", "senha-demo-123").status_code == 200


def test_email_semente_passa_pela_validacao_do_login():
    """Um e-mail que o login recusaria (domínio reservado) é barrado já na configuração."""
    import pytest
    from pydantic import ValidationError

    from app.config import Settings

    for email in ["gov@waterwaltz.test", "gov@exemplo.local", "gov@localhost"]:
        with pytest.raises(ValidationError, match="seed_gov_email"):
            Settings(_env_file=None, seed_gov_email=email)
        with pytest.raises(ValidationError, match="demo_user_email"):
            Settings(_env_file=None, demo_user_email=email)
    assert Settings(_env_file=None, seed_gov_email="governo@waterwaltz.dev").seed_gov_email == "governo@waterwaltz.dev"


def test_conta_governo_semente_consegue_login(client):
    from app.config import settings

    r = login(client, settings.seed_gov_email, "senha-gov-123")
    assert r.status_code == 200
    assert r.json()["user"]["email"] == settings.seed_gov_email
