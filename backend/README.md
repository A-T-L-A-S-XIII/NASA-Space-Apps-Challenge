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

Com Docker, sem instalar nada (a partir da **raiz** do repositório):

```bash
docker build -t water-waltz-api .
docker run --rm water-waltz-api pytest
docker run --rm -p 8000:8000 --env-file backend/.env water-waltz-api
```

## Modo offline (pitch sem internet)

1. Com internet, gere os snapshots do ASF (cenas NISAR GCOV) e da NOAA (ONI):

   ```bash
   python scripts/snapshot.py              # ou: --products GCOV GUNW
   ```

   Eles ficam em `app/data/snapshots/*.json` e vão junto no commit e na imagem Docker.
2. No `.env`, ponha `OFFLINE_MODE=true`. A API para de chamar o ASF e a NOAA e lê só os snapshots.
3. Mesmo com `OFFLINE_MODE=false`, se a chamada ao vivo falhar e houver snapshot, ele é usado. A
   resposta vem com `"live": false`, `"snapshot_date"` (quando o snapshot foi salvo) e o `error`
   original. Sem snapshot, o comportamento é o de antes: lista ou série vazia com `error`.

Rode o script de novo perto do pitch para os dados ficarem atualizados.

## Endpoints

| Método | Rota | Descrição | Dados |
|---|---|---|---|
| GET | `/health` | Status da API | — |
| POST | `/api/auth/register` | Cadastro público (sempre cria `cidadao`) | — |
| POST | `/api/auth/login` | Devolve `{access_token, token_type, user}` | — |
| GET | `/api/auth/me` | Usuário logado (header `Authorization: Bearer <token>`) | — |
| POST | `/api/auth/gov-users` | Cria usuário `governo` (só para usuários `governo`) | — |
| GET | `/api/me/city-status` | Cidadão: a cidade do cadastro está na mancha d'água do mês atual? + alertas ativos | demo |
| GET | `/api/alerts` | Alertas ativos (`region_id`, `city_id`; com `city_id` inclui os da região inteira). Público | banco |
| POST | `/api/alerts` | Cria alerta `{region_id, city_id?, level, title, message}` (só `governo`) | banco |
| PATCH | `/api/alerts/{id}` | `{"active": false}` desativa o alerta (só `governo`) | banco |
| GET | `/api/gov/export/{region_id}.csv` | Linha do tempo em CSV: data, área, anomalia, status, ONI, fase, fonte (só `governo`) | demo + ONI |
| GET | `/api/regions` | Regiões monitoradas (piloto: `vale-do-taquari`) | fixo |
| GET | `/api/regions/{id}` | Bbox, centro, cidades e traçado do rio | fixo |
| GET | `/api/regions/{id}/status` | Resumo para o card principal: água do mês, ENSO e última cena NISAR | demo + ao vivo |
| GET | `/api/regions/{id}/nisar-processed` | Cenas NISAR já processadas por `scripts/process_nisar.py` em mancha real (granule, data, trilha, limiar, área) | **NISAR real** |
| GET | `/api/regions/{id}/event` | Evento NISAR mais recente (hoje: julho/2026): cenas de antes e depois, água total em cada uma, água nova (4,2 km²) e nº de polígonos | **NISAR real** |
| GET | `/api/regions/{id}/passes` | Catálogo das 19 passagens NISAR (jun–out/2026): data, trilha, órbita, água, cheia e seca; e as 9 descartadas | **NISAR real** |
| GET | `/api/regions/{id}/recurrence` | "Recorrente ou pontual?": manchas por classe, classe de cada cidade e área alagada por mês desde 2015 (`geometry=false` para só os números) | **Sentinel-1 real** |
| GET | `/api/regions/{id}/scenes` | Cenas NISAR do ASF (`start`, `end`, `product=GCOV`, `limit=25`) | **ao vivo** |
| GET | `/api/regions/{id}/timeline` | Série mensal: área, anomalia, status, ONI e fase ENSO (`start=2022-01`, `end`). Com dia (`AAAA-MM-DD`): uma linha por passagem NISAR, com a trilha | demo + NISAR + ONI ao vivo |
| GET | `/api/regions/{id}/water-mask` | GeoJSON da mancha d'água (`date=AAAA-MM` ou `AAAA-MM-DD`), área e cidades atingidas | demo + NISAR |
| GET | `/api/regions/{id}/water-mask/frames` | Todos os meses de uma vez (`start=2022-01`, `end`; máx. 120), geometria simplificada. Com dia: só os dias com mancha real | demo + NISAR |
| GET | `/api/regions/{id}/compare` | Antes/depois (`before`, `after`, mês ou dia), delta, frase e `browse_url` da cena NISAR mais próxima | demo + NISAR + ASF |
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
| **ASF DAAC (NISAR)**, ao vivo | `/scenes`, `/status`, `/compare` | Catálogo público, sem login. Cache de 30 min. Se o ASF falhar: snapshot com `live: false` e `snapshot_date`; sem snapshot, lista vazia e `error`. |
| **NOAA CPC (ONI)**, ao vivo | `/climate/enso`, `/timeline`, `/status` | Arquivo `oni.ascii.txt`. Cache de 6 h. Se a NOAA falhar: último cache com `live: false`, senão o snapshot, senão série vazia com `error`. |
| **DemoProvider**, demo | `/timeline`, `/water-mask`, `/compare`, `/status` | Valores ilustrativos e determinísticos com `"source": "demo"` e `"note"`. Seguem a cronologia real (estiagem de 2022 ao início de 2023; enchentes de set/2023, nov/2023 e mai/2024), mas **não são medições**: o NISAR só entrou em operação depois de 2025. |
| **Evento NISAR da equipe**, real | `/event`, `/passes`, `/water-mask`, `/compare`, `/timeline`, `/frames` com dia | Arquivos em `app/data/nisar/taquari/`, com `"source": "nisar"`. Sem os arquivos, `/event` e `/passes` dão 404 e as outras rotas usam o mês. |
| **Sentinel-1**, processado antes | `/recurrence` | Arquivo gerado por `scripts/process_sentinel1.py` no Earth Engine, com `"source": "sentinel-1"`. Sem o arquivo, 404. |
| **Radar processado** | `/api/timeline`, `/api/layers`... | Arquivos gerados antes pelo pipeline em `data/demo/`. Com `data/fixtures/`, as respostas vêm com `"fixture": true`. |

Alertas e usuários ficam no SQLite. No startup, a API cria a conta governo semente e **2 alertas
de exemplo** com `"source": "demo"` e título começando com `[Exemplo]` (não são avisos reais).
Os ids das cidades são o nome sem acento, com hífen (`mucum`, `roca-sales`) e aparecem em
`/api/regions/{id}`. O `city` do cadastro é comparado do mesmo jeito, então "Muçum" e "mucum" valem.

No `/compare`, `before.browse_url` e `after.browse_url` são a imagem de prévia (browse) da cena NISAR
GCOV mais perto do dia 15 do mês, até 30 dias de distância; senão, `null`. Para 2022–2024 é sempre
`null`, porque o NISAR ainda não operava.

Na mancha demo, a área é calculada em UTM (metros), nunca em graus. Uma cidade conta como
atingida quando a mancha cobre pelo menos 30% de um círculo de 1 km em volta do centro dela.

## Deploy (Render ou Railway)

O `Dockerfile` fica na **raiz** do repositório (a imagem precisa de `backend/`, `data/` e `pipeline/`).
A API sobe com `uvicorn` na porta `$PORT`, que as duas plataformas definem sozinhas.

**Render**

1. *New > Web Service*, conecte o repositório e escolha **Docker** como runtime.
2. Deixe *Root Directory* vazio e *Dockerfile Path* = `./Dockerfile`.
3. Em *Environment*, crie as variáveis abaixo. *Health Check Path*: `/health`.

**Railway**

1. *New Project > Deploy from GitHub repo*. O Railway acha o `Dockerfile` da raiz sozinho.
2. Em *Variables*, crie as variáveis abaixo. Em *Settings > Networking*, gere um domínio público.

**Variáveis** (nunca coloque segredos na imagem nem no repositório):

| Variável | Valor |
|---|---|
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `SEED_GOV_EMAIL`, `SEED_GOV_PASSWORD` | Conta governo inicial (senha forte) |
| `CORS_ORIGINS` | Domínio do frontend na Vercel, ex.: `https://water-waltz.vercel.app` (vírgula para vários) |
| `CORS_ORIGIN_REGEX` | Opcional, para os previews da Vercel: `https://water-waltz.*\.vercel\.app` |
| `OFFLINE_MODE` | `false` (ou `true` no pitch, se a rede do evento for ruim) |

Depois, no projeto da Vercel, aponte o frontend para a URL da API (ex.: `https://water-waltz-api.onrender.com`).

Cuidados:

- O SQLite fica dentro do container: **contas e alertas somem a cada deploy ou reinício**. A conta
  governo semente e os alertas de exemplo são recriados no startup. Para guardar dados de verdade,
  use um disco persistente (Render *Disks*, Railway *Volumes*) com `DATABASE_URL=sqlite:////dados/water_waltz.db`.
- No plano gratuito do Render, o serviço dorme sem acesso e o primeiro pedido demora cerca de 1 min.
  Abra a API alguns minutos antes do pitch.
- As rotas de **radar processado** respondem 503 sem `data/demo/` (que não está no repositório).

## Mancha real do NISAR

`scripts/process_nisar.py` gera a mancha a partir de uma cena GCOV, fora da API:

```bash
pip install -r scripts/requirements-nisar.txt   # asf_search, earthaccess, h5py, rasterio
# no .env: EARTHDATA_USERNAME e EARTHDATA_PASSWORD (conta grátis em urs.earthdata.nasa.gov)
python scripts/process_nisar.py --estimate      # mostra a cena e quantos MB o recorte vai baixar
python scripts/process_nisar.py                 # limiar fixo de -18 dB
python scripts/process_nisar.py --method otsu   # ou --threshold -16, --pol VV, --granule ...
```

1. Busca a cena GCOV mais recente que cobre pelo menos 50% do bbox da região. Se não houver
   nenhuma, usa o Guaíba/Porto Alegre e avisa.
2. Abre o HDF5 (~7 GB) por **streaming**: só os chunks do recorte do bbox são baixados.
3. Lê o recorte em faixas e faz a média de blocos 2×2 (`--downsample 2`, de 10 m para 20 m): menos ruído
   e 4× menos memória. Na resolução nativa (`--downsample 1`), o recorte do Taquari tem 39 milhões de
   pixels e pode estourar a RAM de uma máquina com 5 GB.
4. Converte HH (ou VV) para dB, aplica o limiar, limpa o ruído (maioria 3×3 e manchas menores que 1 ha),
   vetoriza com `rasterio.features.shapes`, simplifica e salva
   `app/data/nisar/{region_id}_{AAAA-MM-DD}.geojson` com granule, data, trilha, limiar e área em km².

O `NisarProvider` (`app/providers/nisar.py`) é o provider de todas as regiões:

- No mês que tem cena processada, `/water-mask`, `/compare`, `/timeline` e `/frames` usam a mancha
  real com `"source": "nisar"` (se houver mais de uma no mês, vale a mais recente).
- A anomalia da mancha real compara só com cenas processadas **da mesma trilha** (a mediana delas).
  Com uma cena só, a anomalia é 0 e o status, `normal`.
- Nos outros meses, cai no `DemoProvider`, com `"source": "demo"`. Se uma resposta mistura os dois
  (ex.: `/compare` entre um mês demo e um mês NISAR), o `source` geral é `demo`.

Já processada: **31/10/2026**, trilha `103_A_163`, HH, limiar −18 dB, **32,8 km²** de água no bbox
(cerca de 1,5 min e 400 MB de RAM, baixando ~107 MB do arquivo de 6,9 GB).

Cuidados:

- A mancha real é **toda a água** detectada no recorte (rio, açudes, lagos), não só o rio. Comparar a
  área dela com a de um mês demo não faz sentido.
- Em área urbana, o radar enxerga menos água do que existe. Vegetação alagada pode passar despercebida em HH.
- Só compare datas da **mesma trilha e da mesma versão** do produto (decisão T-01).

## Recorrência do Sentinel-1 ("recorrente ou pontual?")

O NISAR só tem cenas do Taquari desde 17/06/2026, pouco para falar em recorrência. O histórico vem
do **Sentinel-1** (banda C, desde 2014), processado uma vez no Google Earth Engine, fora da API:

```bash
pip install -r scripts/requirements-sentinel1.txt   # earthengine-api, rasterio
earthengine authenticate                            # uma vez, abre o navegador
# no .env: EE_PROJECT=<id do projeto do Google Cloud registrado no Earth Engine>
python scripts/process_sentinel1.py --estimate      # órbitas e número de cenas
python scripts/process_sentinel1.py                 # leva de 15 a 30 min
```

1. Cenas `COPERNICUS/S1_GRD` (IW, VV) de **uma órbita só** (a mais frequente: 24, descendente).
2. Água em cada cena: VV abaixo de −18 dB, com mediana de 50 m contra o speckle e sem encostas acima
   de 5° (a sombra do radar nos morros parece água).
3. **Permanente** = água em pelo menos 50% das cenas (o leito do rio).
4. Fora do leito, conta em quantos **meses diferentes** cada pixel alagou: **pontual** (1),
   **voltou** (2 a 3) ou **recorrente** (4 ou mais).
5. Baixa o raster de classes em 16 pedaços (o mapa inteiro de uma vez passa do limite do Earth Engine),
   vetoriza e salva `app/data/sentinel1/{region_id}_recorrencia.geojson`, com a área alagada de cada mês.

Na rota `/recurrence`, cada cidade recebe a classe mais forte que cobre pelo menos **10%** do círculo de
1 km em volta do centro (o critério da mancha do mês é 30%; aqui é menor porque a recorrência costuma
atingir só a parte baixa da cidade). Sem nada acima de 10%, a classe é `sem_registro`, que **não** quer
dizer "nunca alagou".

Resultado (órbita 24, 471 cenas de 2015-04-29 a 2026-11-10, 103 meses com passagem): pontual 45,3 km²,
voltou 18,8 km², recorrente 53,4 km², permanente 19,4 km². Meses com mais área alagada fora do leito:
2026-09 (81,5 km²), 2024-05 (34,8), 2018-10 (33,8), 2016-07 (33,1) e 2020-07 (29,5); 2023-09 teve 28,9.
A mediana de um mês comum é 9,6 km² (o ruído de fundo: solo encharcado, superfícies lisas).

Cuidados (é um indicador de recorrência, não um mapa oficial de risco):

- **Enchente curta escapa.** O satélite passa a cada 12 dias (só o Sentinel-1A desde o fim de 2021) e as
  cheias do Taquari sobem e descem em 2 ou 3 dias. No vale estreito de cima (Muçum, Encantado, Roca Sales)
  o pico quase nunca é fotografado, e todas as cidades saem `sem_registro`.
- **Cidade não aparece.** Entre prédios o radar volta forte (reflexão dupla) e a água não fica escura.
- **Nem tudo que alaga é enchente.** Lavoura irrigada (arroz) e banhado no baixo Taquari podem cair em
  `recorrente`.

## Evento NISAR da equipe (julho de 2026)

Os dados que a equipe processou para o frontend também estão no backend, em `app/data/nisar/taquari/`
(copiados de `frontend/data/taquari/`; as imagens continuam em `frontend/public/nisar/`):

- `dados.json` → `GET /api/regions/vale-do-taquari/event`
- `passagens.json` → `GET /api/regions/vale-do-taquari/passes` e `/timeline` com dia
- `area_alagada.json` (134 polígonos de água **nova**) → `/water-mask?date=2026-07-23`

Datas por dia (`AAAA-MM-DD`) nas rotas de água:

- Nos dias das cenas do evento vem o dado real. A cena de antes (11/07) é a referência, com mancha vazia;
  a de depois (23/07) traz a água nova. Por isso `/compare?before=2026-07-11&after=2026-07-23` dá
  `delta_km2` ≈ 4,1: é a água **nova**, não a diferença da água total (16,8 → 20,4 km², no `/event`).
- Nessas manchas, cidade atingida = água nova a até **1,2 km** do centro (a regra de 30% do núcleo não pega
  as faixas estreitas na margem do rio). Nas outras manchas, a regra continua a mesma.
- Um dia sem passagem real vira o mês dele (o `date` da resposta mostra isso). Pedir por mês (`AAAA-MM`)
  funciona como antes: 2022–2024 continuam demo.
- `/timeline` com dia lista as passagens do catálogo. A área muda com a trilha, então a anomalia compara
  cada passagem com a mediana da mesma trilha.

## Próximos passos: trocar o DemoProvider por NISAR real

As rotas de água só conversam com um `WaterProvider` (`app/providers/base.py`), que tem dois
métodos: `water_mask(region, month)` (mês ou dia) e `baseline(region)`. Para usar dado real:

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
2. **Processar mais cenas.** O `NisarProvider` e o script já existem (seção acima); falta rodar o
   script para mais datas e calibrar o limiar com cenas de cheia conhecidas.
3. Cuidados:
   - Só comparar datas da **mesma trilha e da mesma versão** do produto (decisão T-01).
   - Em área urbana, o radar enxerga menos água do que existe.
   - Marcar como "sem observação válida" o que o radar não conseguiu medir.

## Convenções

Código simples, erros da API em português e todo dado simulado marcado (`"source": "demo"` ou
`"fixture": true`). Os textos de clima falam só de tendência: nenhum evento é atribuído ao El Niño
ou à La Niña (decisão D-F).
