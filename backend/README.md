# Water Waltz — Backend (FastAPI)

API do **Water Waltz** (NASA Space Apps Challenge 2026, desafio "Dancing with the SARs"):
secas e enchentes no Vale do Taquari (RS) com dados de radar do NISAR.

> Indicador de mudança de água candidata a partir de radar: não é um mapa validado de enchente,
> não é previsão e não serve para decidir rota ou evacuação.

## Como rodar

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # troque JWT_SECRET e SEED_GOV_PASSWORD
uvicorn app.main:app --reload
```

- Docs interativas (Swagger): http://localhost:8000/docs
- As rotas de **radar processado** precisam de um conjunto de dados pronto. Sem `data/demo/`, elas
  respondem 503. Para desenvolver, gere os dados de teste e aponte a variável **no ambiente** (ela
  não é lida do `.env`):

  ```bash
  pip install -r ../pipeline/requirements.txt
  python ../pipeline/make_dev_fixtures.py
  TFW_DATA_DIR=data/fixtures uvicorn app.main:app --reload
  ```

## Testes

```bash
pip install -r ../pipeline/requirements.txt   # o conftest gera os fixtures com pillow
pytest
```

Os testes não usam a internet: ASF e NOAA são trocados por respostas falsas (`httpx.MockTransport`).

## Endpoints

| Método | Rota | Descrição | Dados |
|---|---|---|---|
| GET | `/health` | Status da API | — |
| POST | `/api/auth/register` | Cadastro público (sempre cria `cidadao`) | — |
| POST | `/api/auth/login` | Devolve `{access_token, token_type, user}` | — |
| GET | `/api/auth/me` | Usuário logado (header `Authorization: Bearer <token>`) | — |
| POST | `/api/auth/gov-users` | Cria usuário `governo` (só para usuários `governo`) | — |
| GET | `/api/regions` | Regiões monitoradas (piloto: `vale-do-taquari`) | fixo |
| GET | `/api/regions/{id}` | Bbox, centro, cidades e traçado do rio | fixo |
| GET | `/api/regions/{id}/status` | Resumo para o card principal: água do mês, ENSO e última cena NISAR | demo + ao vivo |
| GET | `/api/regions/{id}/scenes` | Cenas NISAR do ASF (`start`, `end`, `product=GCOV`, `limit=25`) | **ao vivo** |
| GET | `/api/regions/{id}/timeline` | Série mensal: área, anomalia, status, ONI e fase ENSO (`start=2022-01`, `end`) | demo + ONI ao vivo |
| GET | `/api/regions/{id}/water-mask` | GeoJSON da mancha d'água (`date=AAAA-MM`), área e cidades atingidas | demo |
| GET | `/api/regions/{id}/compare` | Antes/depois (`before`, `after`), delta e frase explicativa | demo |
| GET | `/api/climate/enso` | ONI da NOAA com a fase: El Niño, La Niña ou Neutro (`start` opcional) | **ao vivo** |
| GET | `/api/explain` | Textos para leigos (`{id, title, summary, body, icon}`) | fixo |
| GET | `/api/explain/{topic}` | `sar`, `agua-no-radar`, `nisar`, `el-nino`, `la-nina`, `como-ler-o-mapa` | fixo |
| GET | `/api/timeline` | Datas de radar processadas | processado |
| GET | `/api/layers/{date_id}` | Camadas de água e de mudança de uma data | processado |
| GET | `/api/exposure?lat=&lon=` | "Minha área foi atingida?" para um ponto | processado |
| GET | `/api/stats` | Área de água por data e por localidade | processado |
| GET | `/api/localities` | Localidades para a busca | processado |
| GET | `/api/aoi`, `/api/grid`, `/api/access` | Área de estudo, grade de estados, estradas e pontes | processado |
| GET | `/api/files/{path}` | PNG de uma camada | processado |
| GET | `/api/download/{geojson,csv,png}` | Downloads com procedência | processado |

Os formatos das respostas estão em `app/schemas.py`. Para o Next.js, os types e um client fetch
estão em `frontend-api.ts`.

## O que é ao vivo, o que é demo

| Fonte | Rotas | Como |
|---|---|---|
| **ASF DAAC (NISAR)**, ao vivo | `/scenes`, `/status` | Catálogo público, sem login. Cache de 30 min. Se o ASF falhar: `live: false`, lista vazia e `error`. |
| **NOAA CPC (ONI)**, ao vivo | `/climate/enso`, `/timeline`, `/status` | Arquivo `oni.ascii.txt`. Cache de 6 h. Se a NOAA falhar: último cache com `live: false`, ou série vazia com `error`. |
| **DemoProvider**, demo | `/timeline`, `/water-mask`, `/compare`, `/status` | Valores ilustrativos e determinísticos com `"source": "demo"` e `"note"`. Seguem a cronologia real (estiagem de 2022 ao início de 2023; enchentes de set/2023, nov/2023 e mai/2024), mas **não são medições**: o NISAR só entrou em operação depois de 2025. |
| **Radar processado** | `/api/timeline`, `/api/layers`... | Arquivos gerados antes pelo pipeline em `data/demo/`. Com `data/fixtures/`, as respostas vêm com `"fixture": true`. |

Na mancha demo, a área é calculada em UTM (metros), nunca em graus. Uma cidade conta como
atingida quando a mancha cobre pelo menos 30% de um círculo de 1 km em volta do centro dela.

## Próximos passos: trocar o DemoProvider por NISAR real

As rotas de água só conversam com um `WaterProvider` (`app/providers/base.py`), que tem dois
métodos: `water_mask(region, month)` e `baseline(region)`. Para usar dado real:

1. **Processar o GCOV fora da API** (decisão D-D: nada é processado ao vivo), num script do `pipeline/`:
   - Buscar as cenas GCOV que cobrem o bbox (o `asf_search` ou a rota `/scenes` já fazem isso).
   - Ler só o recorte da região no HDF5. Cada arquivo tem cerca de 7 GB, mas o servidor aceita
     *byte ranges*, então dá para ler só o pedaço do bbox com login Earthdata.
   - Pegar o retroespalhamento **HH** (ou **VV**) e converter para dB: `10 * log10(valor)`.
   - Detectar água com um limiar: começar perto de **−18 dB** (configurável) ou calcular o limiar
     por Otsu em cada cena.
   - Limpar ruído (filtro de mediana, remover manchas pequenas), vetorizar a máscara
     (`rasterio.features.shapes`), simplificar e salvar como GeoJSON com metadados: granule,
     data, trilha, limiar e área em km².
2. **Criar `app/providers/nisar.py`** com um `NisarProvider` que lê esses GeoJSON:
   - `water_mask` devolve a mancha da data pedida com `source="nisar"`, e `baseline`, a mediana das
     datas da mesma trilha.
   - Para meses sem cena processada, ele delega ao `DemoProvider`, que continua marcado como demo.
3. **Ligar em `get_provider()`** (`app/providers/__init__.py`). Os endpoints não mudam.
4. Cuidados:
   - Só comparar datas da **mesma trilha e da mesma versão** do produto (decisão T-01).
   - Em área urbana, o radar enxerga menos água do que existe.
   - Marcar como "sem observação válida" o que o radar não conseguiu medir.

## Convenções

Código simples, erros da API em português e todo dado simulado marcado (`"source": "demo"` ou
`"fixture": true`). Os textos de clima falam só de tendência: nenhum evento é atribuído ao El Niño
ou à La Niña (decisão D-F).
