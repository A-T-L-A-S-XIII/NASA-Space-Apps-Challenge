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
| GET | `/api/nisar/passagens?mes=AAAA-MM` | Passagens NISAR já processadas (`Fotos/nisar_taquari_50`), com links de imagem e GeoJSON |
| GET | `/api/nisar/passagens/{n}` | Uma passagem (dados do catálogo) |
| GET | `/api/nisar/passagens/{n}/geojson` | Polígonos de cheia e seca da passagem (`?download=true` baixa o arquivo) |
| GET | `/api/nisar/passagens/{n}/imagem/{radar,slide}` | Imagem de radar (`miniatura.png`) ou painel do processamento (`slide.png`) |
| GET | `/api/nisar/resumo?mes=` | Frase em linguagem comum sobre a situação do mês + números (padrão: `2026-07`) |
| GET | `/api/nisar/municipios?mes=` | Cheia e seca por município (malha IBGE em `app/data/vale_municipios.geojson`) |
| GET | `/api/nisar/municipios/geojson` | Malha dos municípios que tocam a área processada |
| GET | `/api/nisar/geojson?mes=` | Cheia e seca de todas as passagens do mês (`?download=true`) |
| GET | `/api/nisar/exportar?formato={csv,json}&mes=` | Exportação das passagens (JSON inclui municípios e metadados) |
| GET | `/api/nisar/metadados` | Satélite, produto, polarização, trilhas, grânulos, área coberta e cuidados |
| GET | `/api/nisar/vegetacao-alagada` | Responde **501**: ainda não há dado (cenas só em HH) |
| GET | `/api/previsao?lat=&lon=&dias=7` | Previsão do tempo (Open-Meteo); padrão: centro do Vale do Taquari |
| GET | `/api/lugares?q=` | Busca: municípios (IBGE, local) e bairros (Nominatim/OSM, limitado ao vale) |

As rotas de radar (`/api/timeline` em diante) só leem os arquivos já processados em `data/demo/`; nada é processado ao vivo. Formato das respostas: `app/schemas.py`.

As rotas `/api/nisar/*` leem `Fotos/nisar_taquari_50/` (branch `Fotos`; outro lugar via `NISAR_DIR`). `/api/previsao` e `/api/lugares` chamam serviços externos (Open-Meteo e Nominatim) e guardam a resposta em cache na memória. O Nominatim aceita no máximo 1 pedido por segundo, e a rota respeita esse limite.

No startup, a conta governo semente (`SEED_GOV_EMAIL` / `SEED_GOV_PASSWORD`) é criada se ainda não existir.

## Convenções

Código simples, erros da API em português e todo dado simulado marcado (`"source": "demo"` ou `"fixture": true`).
