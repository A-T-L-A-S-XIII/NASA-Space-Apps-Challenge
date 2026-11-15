# Water Waltz — Backend (FastAPI)

API do **Water Waltz** (NASA Space Apps Challenge 2026, desafio "Dancing with the SARs"):
secas e enchentes com dados de radar do NISAR. Piloto: Vale do Taquari (RS).

## Rodando

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # ajuste JWT_SECRET e a senha do governo semente
uvicorn app.main:app --reload
```

Docs interativas: http://localhost:8000/docs

## Testes

```bash
pytest
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Status da API |
| POST | `/api/auth/register` | Cadastro público — sempre cria `cidadao` |
| POST | `/api/auth/login` | Retorna `{access_token, token_type, user}` |
| GET | `/api/auth/me` | Usuário logado (header `Authorization: Bearer <token>`) |
| POST | `/api/auth/gov-users` | Cria usuário `governo` (só para usuários `governo`) |
| GET | `/api/regions` | Regiões monitoradas (piloto: `vale-do-taquari`) |
| GET | `/api/regions/{id}` | Detalhe da região: bbox, centro, cidades e traçado do rio |
| GET | `/api/regions/{id}/scenes` | Cenas NISAR ao vivo do ASF (`start`, `end`, `product=GCOV`, `limit=25`) |

As cenas vêm do catálogo público do ASF DAAC (sem login), com cache de 30 min.
Se o ASF estiver fora do ar, a rota responde `live: false`, lista vazia e `error`.

No startup, a conta governo semente (`SEED_GOV_EMAIL` / `SEED_GOV_PASSWORD`) é criada se ainda não existir.

## Convenções

Veja `CLAUDE.md`. Resumo: código simples, erros da API em português e todo dado simulado com `"source": "demo"`.
