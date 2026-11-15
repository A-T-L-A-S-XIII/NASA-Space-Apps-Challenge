# Integração do mockup (PR #17) com o backend do main

Levantamento feito no branch `integracao-mockup` (base: `main` em `e6990cf`), com o mockup trazido do PR #17
(`new-frontend`, commit `9cef948`). Nenhuma linha do mockup nem do backend foi alterada.

> **Pastas:** o mockup passou para `frontend/` (`git mv mockup frontend`). O antigo `frontend/` do main
> (Next.js em TypeScript, 17 arquivos) foi para `frontend-legado/` (`git mv`), sem nenhuma alteração. Os
> caminhos `js/…` abaixo ficam dentro de `frontend/`. Os 23 testes passam com
> `node --test "frontend/tests/*.test.mjs"`.
>
> **Ainda apontam para o Next.js antigo em `frontend/`** (ficaram como estavam, porque esta etapa não muda
> lógica): `.gitignore` (`frontend/.next/`, `frontend/out/`, `frontend/next-env.d.ts`, `frontend/public/api/`),
> `.env.example`, `.dockerignore`, `README.md` (estrutura, `npm run dev`, deploy na Vercel com Root Directory
> `frontend`), `docs/DECISIONS.md` (T-05), `backend/export_static.py` (grava em `frontend/public/api/`) e
> comentários em `backend/app/schemas.py` (`frontend/lib/types.ts`). Dentro do mockup, `README.md`,
> `js/vale.js:154` e `tests/helpers.mjs:1` ainda falam em `mockup/`.

Fontes lidas: `backend/app/routers/*`, `backend/app/schemas.py`, `backend/app/config.py`,
`backend/frontend-api.ts` e o `/openapi.json` do main rodando localmente (34 rotas). Do lado do mockup:
`js/api.js`, `js/vale.js`, `js/home.js`, `js/radar-highlight.js`, `js/login.js`, `js/app.js`, `js/modes.js`. Do PR:
`backend/app/routers/nisar.py`, `backend/app/services/nisar.py` e `backend/app/services/contexto.py`.

## Como o mockup fala com a API

- `js/api.js` é o único arquivo com `fetch`. A base vem de `?api=` na URL, de `window.WW_API_BASE` ou, por
  padrão, de `http://localhost:8000`. Faz cache dos GET em memória e mandava `Authorization: Bearer` com o
  token do `sessionStorage` (`ww-token`). Hoje o token fica num cookie httpOnly (ver "Login e cadastro no mockup").
- Além do `fetch`, o mockup monta URLs com `WW.api.url(...)` para `<img src>` e para os links `download`.
- Só as telas do Vale (`#/vale`, `#/vale/dados`), a pílula **Satélite** da Visão geral e o login chamam a
  API. O globo e o Explorar dados (`js/explore.js`, `data/content.js`) usam dados locais marcados como
  "simulado".
- CORS: o mockup roda em `http://localhost:5178`. O `main` só libera `http://localhost:3000` por padrão, então
  vai ser preciso pôr a 5178 em `CORS_ORIGINS` no `.env` (é configuração, não código).

## Tabela de contrato

Legenda da coluna "No main": **=** existe igual · **≈** existe com outro formato · **✗** não existe.

| # | Chamada do mockup (rota do PR) | Onde | Formato que o mockup espera | No main | Formato que o main devolve | Campos que faltam ou têm outro nome |
|---|---|---|---|---|---|---|
| 1 | `POST /api/auth/login` `{email, password}` | `login.js` → `api.login` | `{access_token, user: {name, email, …}}` | **=** `POST /api/auth/login` | `TokenResponse {access_token, token_type, user: UserOut{id, name, email, role, city, created_at}}` | Nada falta. O mockup usa `access_token`, `user.name` e `user.email`. |
| 2 | `GET /api/regions/vale-do-taquari` | `vale.js` `loadBase` | `{river: {coordinates: [[lon,lat]…]}, cities: [{name, lat, lon}]}` | **=** `GET /api/regions/{region_id}` | `Region {id, name, state, bbox, center, zoom, cities[{id, name, lat, lon}], river{name, coordinates}}` | Nada falta: o main ainda acrescenta `cities[].id`. |
| 3 | `GET /api/nisar/resumo?mes=2026-07` | `vale.js` (status, área, "dois jeitos", painel técnico) | `{mes, mes_nome, passagens, nivel: normal\|atencao\|alagamento\|sem_dados, frase, cheia_km2, seca_km2, pico{data, cheia_km2}\|null, na_janela_da_enchente, por_trilha[{trilha, passagens, agua_min_km2, agua_max_km2}], datas[], area_coberta{oeste, sul, leste, norte}, aviso}` | **≈** `GET /api/regions/{id}/status` (mês atual) ou `GET /api/regions/{id}/timeline` | `RegionStatus {water{date, water_area_km2, anomaly_pct, status: seca\|normal\|alerta\|enchente, event, source, note}, enso, latest_scene, text}`, mensal e com `source: "demo"` | Não há resumo das passagens NISAR do mês. Faltam `passagens`, `cheia_km2`, `seca_km2`, `pico`, `por_trilha`, `datas`, `area_coberta` e `aviso`. `frase` ≈ `text`; `nivel` ≈ `status`, mas com outro vocabulário. Os números do main são **demo**, os do mockup vêm das 19 passagens reais. |
| 4 | `GET /api/nisar/passagens` e `?mes=` | `vale.js`, `home.js` (Satélite), `radar-highlight.js` | `{mes, meses[], area_coberta{oeste, sul, leste, norte}, itens[{n, data, trilha, pol, passagens_na_orbita, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, limites_leaflet, fonte, granulo, imagens{radar, slide}, geojson}]}` | **≈** `GET /api/regions/{id}/nisar-processed` | `NisarProcessed {region_id, count, scenes[{date, acquisition_time, granule, track, flight_direction, polarization, method, threshold_db, water_area_km2, valid_fraction, scene_coverage, pixel_size_m, bbox, processed_at, file}]}`. Hoje tem **1 cena** (31/10/2026, gerada por `scripts/process_nisar.py`), não as 19 de `Fotos/`. | Outros nomes: `data`→`date`, `trilha`→`track`, `pol`→`polarization`, `agua_km2`→`water_area_km2`, `granulo`→`granule`, `limites_leaflet`→`bbox` (outra ordem). Faltam `n`, `passagens_na_orbita`, `cheia_km2`, `seca_km2`, `na_janela_da_enchente`, `fonte`, `imagens`, `geojson`, `meses`, `area_coberta` e o filtro `?mes=`. |
| 5 | `GET /api/nisar/passagens/{n}/geojson` (`?download=true`) | `radar-highlight.js`, link de download em `vale.js` | FeatureCollection; cada feature com `properties{classe: cheia\|seca, data, trilha, area_km2}` | **≈** `GET /api/regions/{id}/water-mask?date=AAAA-MM` | `WaterMaskCollection` por **mês**, com `properties{date, water_area_km2, anomaly_pct, status, event, source, cidades_atingidas, note}` (uma mancha de água, demo) | Não existe recorte por passagem nem as classes `cheia`/`seca`. Faltam `classe`, `trilha` e `area_km2` por polígono, além do `Content-Disposition` com `?download=true`. |
| 6 | `GET /api/nisar/geojson?mes=` (`&download=true`) | `vale.js` `loadBase`, download "julho inteiro" | `{type, mes, fonte, aviso, features[…como #5]}` | **≈** `GET /api/regions/{id}/water-mask?date=` | igual à linha 5 | Iguais aos da linha 5; `mes`→`date`, `fonte`→`source`, `aviso`≈`note`. |
| 7 | `GET /api/nisar/passagens/{n}/imagem/radar` (`miniatura.png`) | `vale.js` (mapa, comparador, linha do tempo, download PNG), `radar-highlight.js` | PNG 382×496 que cobre exatamente `area_coberta` | **✗** | O `/api/files/{path}` só serve `layers/*.png` de `data/demo`, que não existe (responde 503). O `browse_url` do `/compare` aponta para a imagem do ASF, não para o recorte processado. | Rota inteira. |
| 8 | `GET /api/nisar/passagens/{n}/imagem/slide` (`slide.png`) | `vale.js` (figura larga), `radar-highlight.js` (caixas fixas 1800×1056) | PNG | **✗** | — | Rota inteira. |
| 9 | `GET /api/nisar/municipios/geojson` | `vale.js` `loadBase` (malha no mapa) | FeatureCollection com `properties{id, name}` (IBGE) | **✗** | O main não tem malha municipal (`backend/app/data/vale_municipios.geojson` existe só no PR) | Rota e arquivo. |
| 10 | `GET /api/nisar/municipios?mes=` | `vale.js` (tabela "por município", exportação) | `{mes, mes_nome, datas[], metodo, fora_dos_municipios{cheia_km2, seca_km2}, municipios[{id, nome, toca_area_coberta, cheia_km2, seca_km2, por_data[{data, cheia_km2, seca_km2}]}]}` | **✗** | O mais perto é `cidades_atingidas` (nomes) no water-mask, ou `/recurrence` → `cities[]` (Sentinel-1, outra pergunta) | Rota inteira: não existe área por município. |
| 11 | `GET /api/nisar/metadados` | `vale.js` (metadados, vegetação, "como foi feito"), `home.js` | `{satelite, produto, banda, polarizacao[], fonte, local, area_coberta, periodo{inicio, fim, passagens}, janela_da_enchente{inicio, fim, origem}\|null, trilhas[{trilha, passagens, datas}], classes{cheia, seca}, cuidados[], vegetacao_alagada{disponivel, motivo, requer}, granulos[], municipios_fonte}` | **✗** (só pedaços) | Partes soltas: `nisar-processed` (grânulo, trilha, polarização), `/api/explain/{topic}` (textos) | Rota inteira. O `vegetacao_alagada` é texto fixo no PR. |
| 12 | `GET /api/previsao` (`?lat&lon&dias`) | `vale.js` (cartão de previsão e tabela técnica) | `{fonte, tipo, lat, lon, gerado_em, chuva_total_mm, frase, dias[{data, chuva_mm, prob_chuva, tmin, tmax}]}` | **✗** | — | Rota inteira (Open-Meteo). |
| 13 | `GET /api/lugares?q=` | `vale.js` (busca) | `{q, itens[{nome, tipo: município\|bairro\|…, lat, lon, dentro_da_area_coberta, fonte}], erro_bairros}` | **≈** `GET /api/localities` | `Localities {fixture, items[{locality_id, name, lat, lon, source}]}`, lista fixa sem busca; hoje responde **503** (não há `data/demo`) | Faltam a busca por `q`, `tipo`, `dentro_da_area_coberta`, os bairros (Nominatim) e `erro_bairros`. Outros nomes: `nome`→`name`, `fonte`→`source`, `itens`→`items`. |
| 14 | `GET /api/nisar/exportar?formato=csv&mes=` | link de download em `vale.js` | CSV `n, data, trilha, pol, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, granulo, fonte` | **≈** `GET /api/download/csv` ou `GET /api/gov/export/{id}.csv` | `/download/csv`: estatísticas de `data/demo` (503 hoje). `/gov/export`: linha do tempo demo e **só para governo** (fora do escopo). | Rota inteira, com essas colunas. |
| 15 | `GET /api/nisar/exportar?formato=json&mes=` | link de download em `vale.js` | `{mes, metadados, passagens[], municipios[]}` | **✗** | — | Rota inteira. |

### Exportação feita no navegador

O botão **Exportar dados** do modo Aprofundado (`WW.exportData` em `js/modes.js`) não chama rota própria:
monta JSON, CSV de passagens e CSV de polígonos com o que já carregou nas linhas 4, 6, 10 e 11. Funciona
assim que essas rotas existirem.

### Rotas do PR que o mockup não chama

`GET /api/nisar/passagens/{n}` e `GET /api/nisar/vegetacao-alagada` (responde 501). O mockup lê a vegetação de
dentro de `metadados`.

## O que o mockup usa e o main não tem

| Recurso | No PR | No main | Situação |
|---|---|---|---|
| **Previsão do tempo (Open-Meteo)** | `/api/previsao` + `services/contexto.py` + `open_meteo_url`, `forecast_cache_ttl_seconds` e `external_timeout_seconds` no `config.py` | nada | **falta** |
| **Busca de lugares: municípios (IBGE)** | `/api/lugares`, busca local em `vale_municipios.geojson` | `/api/localities` sem busca, dependente de `data/demo` (503) | **falta** |
| **Busca de lugares: bairros (Nominatim)** | `/api/lugares`, Nominatim com limite de 1 pedido/s, User-Agent e cache de 24 h; `nominatim_url` no config | nada | **falta** |
| **Área por município** | `/api/nisar/municipios` + malha IBGE (`vale_municipios.geojson`, gerada por `pipeline/build_vale_municipios.py`) | nada; só nomes em `cidades_atingidas` (demo) | **falta**, incluindo a malha |
| **Exportação JSON** | `/api/nisar/exportar?formato=json` | nada | **falta** |
| **Exportação CSV** | `/api/nisar/exportar?formato=csv` | `/api/download/csv` (outro conteúdo, 503 hoje) e `/api/gov/export/{id}.csv` (governo, fora do escopo) | **falta** com essas colunas |
| **Exportação GeoJSON** | `/api/nisar/passagens/{n}/geojson?download=true` e `/api/nisar/geojson?mes=&download=true` | `/api/download/geojson` (estatísticas de `data/demo`, 503) e `/water-mask` (demo, sem `Content-Disposition`) | **falta** por passagem e por mês com cheia/seca |
| **Imagem `miniatura.png`** (radar) | `/api/nisar/passagens/{n}/imagem/radar` | nada | **falta** |
| **Imagem `slide.png`** | `/api/nisar/passagens/{n}/imagem/slide` | nada | **falta** |
| **`animacao.gif`** | está em `Fotos/` | está em `Fotos/` | **ninguém usa**: nem o backend do PR nem o mockup. A linha do tempo é animada no navegador trocando as `miniatura.png`. O mesmo vale para `mosaico_50.png` e `serie_temporal.png`. |
| **As 19 passagens NISAR (`Fotos/nisar_taquari_50`)** | lidas pela API (`services/nisar.py`) | arquivos no repositório, mas a API não lê (`backend/PENDENCIAS.md` já lista isso) | **falta** servir |
| **Classes cheia/seca por polígono** | `area_cheia_seca.geojson` de cada passagem | só uma mancha de água por mês (demo ou a cena de 31/10) | **falta** |
| **Resumo do mês com frase e nível** | `/api/nisar/resumo` | `/status` e `/timeline` (demo, por mês) | **falta** para as passagens reais |
| **Metadados do processamento** | `/api/nisar/metadados` | nada consolidado | **falta** |
| **Área coberta (`area_coberta`)** | derivada de `limites_leaflet` do catálogo | não existe; `bbox` da região é maior (−29,85 a −29,05) | **falta** (o mockup precisa dela para posicionar a imagem e o marca-texto) |
| **CORS para `localhost:5178`** | padrão no `config.py` do PR | só `localhost:3000` + regex opcional | **configuração**: basta o `.env` |

### `Fotos/` no PR e no main

São **idênticas**. A árvore `Fotos/` tem o mesmo hash nos dois (`c5b16fa`) e `git diff origin/main pr-17 --
Fotos` não mostra diferença. São 82 arquivos. Na raiz de `nisar_taquari_50` ficam `animacao.gif`, `catalogo.csv`,
`catalogo.json`, `mosaico_50.png`, `passagens_puladas.json` e `serie_temporal.png`; os três PNG/GIF não são
usados pelo PR nem pelo mockup. Além deles há 19 pastas `img_NN_AAAA-MM-DD/`, cada uma com `area_cheia_seca.geojson`,
`dados.json`, `miniatura.png` e `slide.png`.

### Outras diferenças do backend do PR (não entram nesta etapa)

O PR saiu de `ed8a7ea` e, para chegar ao estado dele, **apagaria** do main: alertas, clima/ENSO, explicações,
água (timeline, water-mask, compare), status, recorrência Sentinel-1, snapshots/modo offline, `frontend-api.ts`,
`scripts/process_*.py`, `data/roads/osm_roads.geojson` e cerca de 1.000 linhas de testes. Também reverte os
`summary`/tags em português do OpenAPI. Por isso só a pasta `mockup/` foi trazida.

## Login e cadastro no mockup

- **Conta:** uma só, a de demonstração (role `cidadao`), criada pelo FastAPI no startup a partir de
  `DEMO_USER_NAME`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` e `DEMO_USER_CITY` (`ensure_seed_user`). Não há conta
  governo no frontend.
- **Ponte no Next (`frontend/lib/auth.mjs`):** `POST /api/auth/login` chama o FastAPI e grava o token no cookie
  `ww_token` (httpOnly, SameSite=Lax, Secure em produção; sem "Manter conectado", cookie de sessão). A resposta
  traz só `{ user: { name, city } }`. `GET /api/auth/me` manda `Authorization: Bearer` a partir do cookie.
  `POST /api/auth/logout` apaga o cookie. Com o FastAPI inacessível a ponte devolve 502 (rede) ou 504 (tempo).
  As demais rotas `/api/*` recebem o `Authorization` do cookie em `frontend/middleware.js`.
- **Login (`js/login.js`):** valida os campos e chama a ponte. 401 → "E-mail ou senha incorretos." na área de
  erro, com foco nela. Abaixo do botão: "Protótipo de demonstração. Use a conta da equipe." e "Criar conta".
  Não há mais "Entrar como visitante".
- **Sessão (`js/api.js`, `js/app.js`):** o `sessionStorage` guarda só nome e cidade (`ww-user`). As telas
  internas chamam `/api/auth/me` uma vez por carga; 401 volta a `#/login`. "Sair" chama `/api/auth/logout`.
- **Plano B:** com 502/504 no login, só o e-mail de `DEMO_EMAIL` (devolvido pela ponte) entra, numa sessão
  marcada `ww-offline`, com aviso no console. Com essa sessão, um 502/504 no `/me` não derruba; um 401 sempre derruba.
- **Cidade → região:** a cidade do usuário vira o município inicial (`valeMunicipios` em `data/content.js`); a
  região é sempre `vale-do-taquari`.
- **Cadastro (`#/cadastro`):** mesmo cartão do login, com nome, e-mail, senha e cidade (select local). Com tudo
  válido mostra, com `role="status"`, "O cadastro está desativado nesta demonstração. Entre com a conta de
  demonstração." e um link para o login. Não chama `/api/auth/register`.
