# Water Waltz — Backend

## Contexto

- Evento: NASA Space Apps Challenge 2026, desafio **"Dancing with the SARs"**.
- Projeto: **Water Waltz** — mostra **secas e enchentes** usando dados de radar (SAR) do satélite **NISAR**.
- O **El Niño** é uma das causas explicadas, mas **não é o tema único**.
- Piloto do MVP: **Vale do Taquari (RS)**.
- Frontend: Next.js/React, em português, rodando em `http://localhost:3000`.

## Stack

- FastAPI + SQLAlchemy 2 + SQLite
- `pydantic-settings` lendo `.env` (ver `.env.example`)
- Senhas com `bcrypt` direto (sem passlib); tokens com `PyJWT`
- Testes com `pytest` + `TestClient`

## Estrutura

- `app/main.py` — cria o app, CORS, startup (conta governo semente), `/health`
- `app/config.py` — configurações
- `app/db.py` — engine, sessão e modelos
- `app/security.py` — hash de senha, JWT e dependências de usuário
- `app/schemas.py` — schemas Pydantic
- `app/routers/` — endpoints
- `app/services/` — regras de negócio
- `app/data/` — arquivos de dados (incluindo dados demo)

## Regras

1. **Código e comentários simples.** Prefira clareza a abstrações.
2. **Mensagens de erro da API em português** (ex.: `"E-mail já cadastrado"`).
3. **Todo dado simulado deve ser sinalizado com `"source": "demo"`.** Nunca apresente dado simulado como dado real do NISAR.
4. Cadastro público (`/api/auth/register`) **sempre** cria role `"cidadao"`. Só um usuário `"governo"` pode criar outro usuário governo (`/api/auth/gov-users`).
5. Rode `pytest` antes de considerar uma tarefa concluída.
