# Water Waltz — Backend (FastAPI)

## Rodando

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # ajuste JWT_SECRET e a senha do governo semente
uvicorn app.main:app --reload
```

Docs interativas: http://localhost:8000/docs

Para usar os dados de teste do radar: `python ../pipeline/make_dev_fixtures.py` e `TFW_DATA_DIR=data/fixtures` no `.env`.

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
| GET | `/api/regions/{id}/scenes` | Cenas NISAR do catálogo do ASF (`start`, `end`, `product=GCOV`, `limit=25`) |
| GET | `/api/timeline` | Datas de radar processadas |
| GET | `/api/layers/{date_id}` | Camadas de água e de mudança de uma data |
| GET | `/api/exposure?lat=&lon=` | "Is my area affected?" para um ponto |
| GET | `/api/stats` | Área de água por data e por localidade |
| GET | `/api/localities` | Localidades para a busca |
| GET | `/api/download/{geojson,csv,png}` | Downloads com procedência |

As rotas de radar (`/api/timeline` em diante) só leem os arquivos já processados em `data/demo/`; nada é processado ao vivo. Formato das respostas: `app/schemas.py`.

No startup, a conta governo semente (`SEED_GOV_EMAIL` / `SEED_GOV_PASSWORD`) é criada se ainda não existir.

## Convenções

Código simples, erros da API em português e todo dado simulado marcado (`"source": "demo"` ou `"fixture": true`).
