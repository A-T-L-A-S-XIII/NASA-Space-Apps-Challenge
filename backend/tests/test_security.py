"""Revisão de segurança: segredos no Render, tokens inválidos, CORS e login."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, check_production_secrets, insecure_secrets, settings
from app.db import SessionLocal
from app.main import app
from app.services.users import get_user_by_email
from tests.conftest import auth_header, login

DEMO_EMAIL = "demo@teste.dev"
DEMO_PASSWORD = "senha-demo-123"  # só de teste (conftest.py), nunca a do Render
ROTAS_PROTEGIDAS = ["/api/auth/me", "/api/me/city-status"]


# --------------------------------------------------------------------- segredos no Render

def _settings(**valores):
    base = {"jwt_secret": "chave-forte-de-teste-0123456789abcdef",
            "demo_user_password": "senha-forte-de-teste",
            "seed_gov_password": "outra-senha-forte-de-teste"}
    return Settings(_env_file=None, **{**base, **valores})


@pytest.mark.parametrize("campo,variavel", [("jwt_secret", "JWT_SECRET"),
                                            ("demo_user_password", "DEMO_USER_PASSWORD"),
                                            ("seed_gov_password", "SEED_GOV_PASSWORD")])
@pytest.mark.parametrize("valor", ["troque-esta-chave", "troque-esta-senha", "", "   "])
def test_render_recusa_segredo_padrao_ou_vazio(campo, variavel, valor):
    s = _settings(**{campo: valor})
    assert insecure_secrets(s) == [variavel]
    with pytest.raises(RuntimeError) as erro:
        check_production_secrets(s, environ={"RENDER": "true"})
    assert variavel in str(erro.value)
    assert valor.strip() == "" or valor not in str(erro.value)  # a mensagem não mostra o valor


def test_render_aceita_segredos_fortes():
    check_production_secrets(_settings(), environ={"RENDER": "true"})


def test_fora_do_render_o_padrao_continua_valendo():
    s = _settings(jwt_secret="troque-esta-chave", demo_user_password="troque-esta-senha",
                  seed_gov_password="troque-esta-senha")  # os valores de exemplo do config.py
    assert insecure_secrets(s) == ["JWT_SECRET", "DEMO_USER_PASSWORD", "SEED_GOV_PASSWORD"]
    check_production_secrets(s, environ={})


def test_app_nao_sobe_no_render_com_segredo_padrao(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setattr(settings, "jwt_secret", "troque-esta-chave")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        with TestClient(app):
            pass


def test_app_sobe_no_render_com_segredos_definidos(monkeypatch):
    monkeypatch.setenv("RENDER", "true")  # conftest.py define valores que não são os de exemplo
    with TestClient(app) as c:
        assert c.get("/health").json() == {"status": "ok"}


# --------------------------------------------------------------------- 401 com token ruim

def _demo_id():
    with SessionLocal() as db:
        return get_user_by_email(db, DEMO_EMAIL).id


def _token(segredo, minutos):
    payload = {"sub": str(_demo_id()), "role": "cidadao",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=minutos)}
    return jwt.encode(payload, segredo, algorithm=settings.jwt_algorithm)


def test_token_bem_formado_funciona(client):
    """Controle: o mesmo payload, assinado com a chave certa e no prazo, entra."""
    r = client.get("/api/auth/me", headers=auth_header(_token(settings.jwt_secret, 10)))
    assert r.status_code == 200
    assert r.json()["email"] == DEMO_EMAIL


@pytest.mark.parametrize("rota", ROTAS_PROTEGIDAS)
def test_401_sem_token(client, rota):
    r = client.get(rota)
    assert r.status_code == 401
    assert r.json()["detail"] == "Não autenticado"


@pytest.mark.parametrize("rota", ROTAS_PROTEGIDAS)
@pytest.mark.parametrize("token", ["token-falso", "a.b.c", "Bearer", ""])
def test_401_token_malformado(client, rota, token):
    r = client.get(rota, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


@pytest.mark.parametrize("rota", ROTAS_PROTEGIDAS)
def test_401_token_com_outra_assinatura(client, rota):
    outra_chave = "outra-chave-que-nao-e-a-da-api-0123456789"
    r = client.get(rota, headers=auth_header(_token(outra_chave, 10)))
    assert r.status_code == 401
    assert r.json()["detail"] == "Token inválido ou expirado"


@pytest.mark.parametrize("rota", ROTAS_PROTEGIDAS)
def test_401_token_expirado(client, rota):
    r = client.get(rota, headers=auth_header(_token(settings.jwt_secret, -1)))
    assert r.status_code == 401
    assert r.json()["detail"] == "Token inválido ou expirado"


@pytest.mark.parametrize("rota", ROTAS_PROTEGIDAS)
def test_401_token_sem_algoritmo(client, rota):
    """Token com alg "none" (sem assinatura) é recusado."""
    token = jwt.encode({"sub": str(_demo_id())}, None, algorithm="none")
    r = client.get(rota, headers=auth_header(token))
    assert r.status_code == 401


# --------------------------------------------------------------------- CORS

def test_cors_sem_curinga_com_credenciais():
    assert "*" not in settings.cors_origins
    assert settings.cors_origin_regex not in ("*", ".*")


def test_cors_origem_desconhecida_nao_recebe_allow_origin(client):
    origem = "https://site-desconhecido.example"
    r = client.get("/health", headers={"Origin": origem})
    assert "access-control-allow-origin" not in r.headers
    pre = client.options("/api/auth/login", headers={"Origin": origem,
                                                      "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in pre.headers


def test_cors_origem_permitida_recebe_allow_origin(client):
    origem = settings.cors_origins[0]
    r = client.get("/health", headers={"Origin": origem})
    assert r.headers["access-control-allow-origin"] == origem
    pre = client.options("/api/auth/login", headers={"Origin": origem,
                                                      "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 200
    assert pre.headers["access-control-allow-origin"] == origem


# --------------------------------------------------------------------- login e senha

def test_login_nao_revela_se_errou_email_ou_senha(client):
    email_errado = login(client, "ninguem@teste.dev", DEMO_PASSWORD)
    senha_errada = login(client, DEMO_EMAIL, "senha-errada-123")
    assert email_errado.status_code == senha_errada.status_code == 401
    assert email_errado.json() == senha_errada.json() == {"detail": "E-mail ou senha incorretos"}


def test_senha_guardada_com_bcrypt(client):
    with SessionLocal() as db:
        hash_salvo = get_user_by_email(db, DEMO_EMAIL).password_hash
    assert hash_salvo.startswith("$2b$")
    assert DEMO_PASSWORD not in hash_salvo
    assert bcrypt.checkpw(DEMO_PASSWORD.encode(), hash_salvo.encode())
