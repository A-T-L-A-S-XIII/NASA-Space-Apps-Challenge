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
| GET | `/api/regions/{id}/timeline` | Série mensal: área de água, anomalia, status, ONI e fase ENSO (`start=2022-01`, `end=<mês atual>`) |
| GET | `/api/regions/{id}/water-mask` | GeoJSON da mancha d'água no mês (`date=AAAA-MM`), com área e cidades atingidas |
| GET | `/api/regions/{id}/compare` | Antes/depois (`before`, `after`): áreas, delta, cidades atingidas e frase explicativa |
| GET | `/api/climate/enso` | ONI real da NOAA com a fase (El Niño, La Niña, Neutro); `start=AAAA-MM` opcional |

As cenas vêm do catálogo público do ASF DAAC (sem login), com cache de 30 min.
Se o ASF estiver fora do ar, a rota responde `live: false`, lista vazia e `error`.

Linha do tempo, mancha e comparação vêm de um *provider* (`app/providers/`). Hoje é o
`DemoProvider`: valores ilustrativos com `"source": "demo"` e um `"note"`, porque o NISAR só
entrou em operação depois de 2025 e não há imagens dele das enchentes de 2023–2024. Para usar
dado real, crie outro provider e troque em `get_provider()`; os endpoints não mudam.

Áreas são calculadas em UTM (metros). Uma cidade conta como atingida quando a mancha cobre
pelo menos 30% de um círculo de 1 km em volta do centro dela. O ONI da NOAA fica 6 h em cache;
se a NOAA cair, a API usa o último cache ou responde `live: false` com `error`.

No startup, a conta governo semente (`SEED_GOV_EMAIL` / `SEED_GOV_PASSWORD`) é criada se ainda não existir.

## Convenções

- Código e comentários simples; prefira clareza a abstrações.
- Mensagens de erro da API em português (ex.: `"E-mail já cadastrado"`).
- Todo dado simulado é sinalizado com `"source": "demo"` e nunca aparece como dado real do NISAR.
- O cadastro público (`/api/auth/register`) sempre cria role `"cidadao"`; só um usuário `"governo"` cria outro usuário governo (`/api/auth/gov-users`).
- Rode `pytest` antes de considerar uma tarefa concluída.
