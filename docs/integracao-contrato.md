# Contrato de integração frontend ↔ backend

Levantamento feito em 15/11/2026, antes de mexer em qualquer lógica.

- **Frontend:** `frontend/` (Next.js 15, JavaScript). Hoje roda sem backend: toda leitura de dados passa por
  `lib/nisarService.js`, e a sessão é falsa (`lib/sessao.js`).
- **Backend:** `backend/` (FastAPI). Fontes conferidas: `app/schemas.py`, `app/routers/*.py`,
  `backend/frontend-api.ts` e o `/openapi.json` do servidor rodando (32 rotas).
- **URL da API no frontend:** `NEXT_PUBLIC_API_URL` (ver `frontend/.env.local.example`).
  Atenção: o comentário de uso em `backend/frontend-api.ts` ainda fala em `NEXT_PUBLIC_API_BASE`.

## 1. Tabela de funções → endpoints

Legenda da coluna "Situação": ✅ cobre · 🟡 cobre em parte (precisa adaptar) · ❌ não existe no backend.

### `lib/nisarService.js`

| Função (quem usa) | O frontend espera | Endpoint que substitui | O backend devolve | Falta ou muda de nome | Situação |
|---|---|---|---|---|---|
| `obterEvento()` (`/painel`, `/analise`, `PalcoMapa`, `Metadados`) | `{ nisar, cenas, indiceAtual, limites, centro, arquivos, limitacoes }`. `nisar` = conteúdo de `data/taquari/dados.json`: `evento`, `local`, `satelite`, `produto`, `data_antes`, `data_depois` (AAAA-MM-DD), `agua_antes_km2`, `agua_depois_km2`, `area_alagada_km2`, `limites_leaflet`, `fonte`. `cenas` = 4 itens `{ data, tipo: 'observado'\|'previsto', rotulo, radar: 'antes'\|'depois', expansaoKm }`. `limites` = `{ sul, oeste, norte, leste }`. `centro` = `{ lat, lon }`. `arquivos` = URLs de `ilustrado`, `ilustradoDepois`, `radarAntes`, `radarDepois`, `geojson`. `limitacoes` = lista de frases. | `GET /api/regions/vale-do-taquari/compare?before=2026-07&after=2026-07` (mais perto) + `GET /api/regions/vale-do-taquari` + `GET /api/regions/vale-do-taquari/nisar-processed` | `Compare`: `before`/`after` com `date` (AAAA-MM), `water_area_km2`, `status`, `cidades_atingidas`, `geojson`, `browse_url`, `browse_date`; mais `delta_km2`, `delta_pct`, `summary`, `source`, `note`. `Region`: `bbox` `[lon_min, lat_min, lon_max, lat_max]`, `center` `[lat, lon]`. | Não há "evento". `data_antes`/`data_depois` → `before.date`/`after.date`, mas só por **mês**. `agua_antes_km2`/`agua_depois_km2` → `before/after.water_area_km2`. `area_alagada_km2` (água **nova**, 4,2 km²) ≠ `delta_km2` (diferença das áreas totais). `limites_leaflet` → precisa converter `bbox`; e o bbox da região (−29,05 a −29,85) é maior que o da cena (−29,15 a −29,55). Faltam `evento`, `local`, `satelite`, `produto`, `fonte`, `cenas`, `indiceAtual`, `arquivos` (imagens), `limitacoes`. Em jul/2026 o backend devolve **`source: "demo"`**, não o NISAR real. | ❌ |
| `obterAlagamento()` (`/painel`, `/analise`) | GeoJSON com 134 polígonos, `properties.classe` (`'alagado'`, talvez `'vegetacao_alagada'`). O frontend acrescenta `area_km2`, `centroide`, `totalKm2` e `classes` em `lib/taquari.js`. | `GET /api/regions/vale-do-taquari/water-mask?date=2026-07` | `WaterMaskCollection`: 1 feature (MultiPolygon) com `properties` `date`, `water_area_km2`, `anomaly_pct`, `status`, `event`, `source`, `cidades_atingidas`, `note`. | A mancha do backend é a **água total do mês**; a do frontend é a **água nova** entre duas datas. Falta `classe` por polígono (o frontend usa `classes.includes('vegetacao_alagada')`). Para jul/2026 vem `source: "demo"`. Os cálculos de área/centroide podem continuar no frontend. | 🟡 |
| `obterPrevisao()` (`/painel`, `PainelBusca`) | `{ probabilidade, intervalo: [min, max], horizonteHoras, nivel, areaPorCena: [4 números], fatores: [frases] }` — **simulada**. | — | — | O backend não faz previsão de propósito (os avisos dizem "não é previsão"). Continua local e marcada como simulada. | ❌ |
| `buscarLocalidade(texto)` (`PainelBusca`) | Até 5 itens `{ nome, uf, lon, lat, status: 'afetada'\|'risco'\|'segura'\|'fora', distanciaKm, areaProximaKm2 }`. | `GET /api/regions/vale-do-taquari` (lista `cities`) + `GET /api/exposure?lat=&lon=` | `Region.cities`: 8 cidades `{ id, name, lat, lon }`. `Exposure`: `inside_aoi`, `latest.state`, `nearest_candidate_water.distance_m`, `history`, `statements`. | A busca de texto não existe: filtrar `cities` no frontend. `nome` → `name`, sem `uf`. O frontend tem 20 localidades e o backend 8. `status` precisa ser derivado (`inside_aoi=false` → `'fora'`; distância → afetada/risco/segura). `distanciaKm` ← `distance_m / 1000`. Sem `areaProximaKm2`. **`/api/exposure` hoje responde 503** (falta `data/demo/manifest.json`). | 🟡 |
| `obterAreaPorMunicipio()` (`/analise`, `AreaPorMunicipio`) | Lista `{ municipio, areaKm2, poligonos }`, ordenada pela área. | `GET /api/stats` (`per_locality`) ou `GET /api/regions/vale-do-taquari/recurrence?geometry=false` (`cities`) | `Stats.per_locality[]`: `locality_id`, `name`, `per_date[{ date_id, candidate_water_km2, valid_fraction }]`. `Recurrence.cities[]`: `city_id`, `name`, `class`, `flooded_share`. | `municipio` → `name`, `areaKm2` → `candidate_water_km2` da data escolhida. Sem `poligonos`. `/api/stats` hoje responde 503. `recurrence` é Sentinel-1 histórico (fração alagada, não km²). | 🟡 |
| `obterPassagens()` (`/analise`, `PassagensNisar`, `Metadados`) | `data/taquari/passagens.json`: `passagens[]` `{ n, data (AAAA-MM-DD), trilha, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, granulo, img, orbita }`, `puladas[] { data, motivo }`, `limites`. | `GET /api/regions/vale-do-taquari/nisar-processed` | `NisarProcessed.scenes[]`: `date`, `acquisition_time`, `granule`, `track`, `flight_direction`, `polarization`, `method`, `threshold_db`, `water_area_km2`, `valid_fraction`, `scene_coverage`, `pixel_size_m`, `bbox`, `processed_at`, `file`. | Hoje só **1** cena (31/10/2026), não 19. `data` → `date`, `trilha` → `track`, `agua_km2` → `water_area_km2`, `granulo` → `granule`, `orbita` → `flight_direction` (`ASCENDING`/`DESCENDING`, em inglês). Faltam `n`, `cheia_km2`, `seca_km2`, `na_janela_da_enchente`, `img` e a lista `puladas`. Ordem invertida (backend: mais recente primeiro). | ❌ |
| `URL_GEOJSON` (botão de download em `/analise`) | URL do arquivo `area_alagada.geojson`. | `GET /api/download/geojson` ou a própria resposta de `/water-mask` | GeoJSON de estatísticas por localidade / mancha do mês. | Conteúdo diferente (não é a água nova de 11/07→23/07). `/api/download/*` hoje responde 503. | 🟡 |

### `lib/sessao.js`

| Função (quem usa) | O frontend espera | Endpoint que substitui | O backend devolve | Falta ou muda de nome | Situação |
|---|---|---|---|---|---|
| `entrar(email)` (`/`) | Só o e-mail; senha ≥ 4 caracteres; não chama nada. Grava `{ email, em, areaCadastrada: 'taquari', boasVindas: true }` no `sessionStorage`. | `POST /api/auth/login` `{ email, password }` | `TokenResponse`: `access_token`, `token_type`, `user { id, name, email, role, city, created_at }`. 401 "E-mail ou senha incorretos". | Precisa receber a senha. Guardar o `access_token`. `areaCadastrada` não existe: o mais perto é `user.city` (uma cidade, não uma região). `role` (`cidadao`/`governo`) é novo e serve para `/governo`. | 🟡 |
| — (`/cadastro`, a criar) | — | `POST /api/auth/register` `{ name, email, password, city? }` | `UserOut` (201). 409 "E-mail já cadastrado". | Senha mínima do backend é **6**, a tela de login aceita 4. `name` é obrigatório. | ✅ |
| `sessaoAtual()` (`ProtegerRota`, `/painel`) | Objeto da sessão ou `null`. | `GET /api/auth/me` (com `Authorization: Bearer`) | `UserOut`. 401 se o token expirou. | `email` → `user.email`. Sem `em`, `areaCadastrada`, `boasVindas` (esses ficam no navegador). | 🟡 |
| `boasVindasVista()` (`/painel`) | Marca o pop-up como visto. | — | — | É estado de interface; continua local. | — (local) |
| `sair()` (`Cabecalho`) | Apaga a sessão. | — | — | JWT não tem logout no servidor: basta apagar o token. | — (local) |

### Outros dados locais com equivalente (fora das duas libs)

| Arquivo | Endpoint | Observação |
|---|---|---|
| `data/regioes.js` (`REGIOES`, 8 regiões) | `GET /api/regions` | Backend tem **1** região. Campos: `nome` → `name`, `local` não existe, `lon/lat` → `center [lat, lon]`, `status: 'disponivel'\|'sem-dados'` e `detalhe` não existem. |
| `/governo/alertas` (a criar) | `GET/POST /api/alerts`, `PATCH /api/alerts/{id}` | Pronto no backend; criar e desativar exigem `role: "governo"`. |
| `/governo` (a criar) | `GET /api/gov/export/{region_id}.csv`, `POST /api/auth/gov-users` | Prontos no backend. |
| Painel do cidadão | `GET /api/me/city-status`, `GET /api/regions/{id}/status` | Prontos, sem tela no frontend ainda. |

## 2. Lacunas: o que não tem equivalente no backend

1. **Datas por dia.** O frontend trabalha com AAAA-MM-DD (11/07, 23/07, 29/07, 04/08; 19 passagens com dia).
   `/timeline`, `/water-mask`, `/water-mask/frames` e `/compare` só aceitam AAAA-MM
   (`?date=2026-07-23` → 422 "Mês inválido"). Antes e depois do evento caem no **mesmo mês**, então
   `/compare?before=2026-07&after=2026-07` compara o mês com ele mesmo. Só `/nisar-processed` tem dia.
2. **Catálogo das 19 passagens** (`data/taquari/passagens.json`). Não existe rota. `/nisar-processed` tem 1 cena
   (31/10/2026) e não traz `cheia_km2`, `seca_km2`, `na_janela_da_enchente`, `img`, `n` nem `puladas`.
   Já está em `backend/PENDENCIAS.md` ("Servir o NISAR já processado").
3. **Metadados do evento** (`data/taquari/dados.json`). Não existe o conceito de "evento"
   (nome, local, par de datas antes/depois, água antes/depois, água nova, satélite, produto, fonte).
4. **Id da região.** Frontend usa `taquari`; backend usa `vale-do-taquari` (`/api/regions/taquari` → 404).
   O `areaCadastrada: 'taquari'` da sessão e o `id` em `data/regioes.js` precisam ser mapeados.
5. **O NISAR real de julho/2026 não está no backend.** Para 2026-07 o backend devolve mancha **demo**
   (29,56 km², `source: "demo"`). O dado real do evento (4,2 km² de água nova, 134 polígonos) só existe no frontend.
   Ligar o frontend no backend hoje trocaria dado real por ilustrativo na tela principal.
6. **Água nova × água total.** O frontend mostra a água **nova** entre duas cenas (`area_alagada_km2`,
   `alagado.png`, GeoJSON por polígono com `classe`). O backend dá a água **total** do mês e a diferença
   de áreas (`delta_km2`), que não é a mesma coisa.
7. **Imagens do radar e mapa ilustrado.** `radar_antes/depois.webp`, `ilustrado*.webp`, máscaras e os 19 quadros
   de `public/nisar/passagens/` não são servidos pelo backend. `/api/files/` só serve `layers/*.png` do dataset
   `data/demo`, que não existe.
8. **Rotas de radar processado fora do ar.** `/api/timeline`, `/api/exposure`, `/api/stats`, `/api/localities`,
   `/api/download/*`, `/api/layers/*`, `/api/grid`, `/api/access` respondem **503** (falta
   `data/demo/manifest.json`). Busca por ponto, área por localidade e download dependem delas.
9. **Previsão.** Sem equivalente, por decisão (o backend avisa que "não é previsão"). Fica simulada no frontend.
10. **Linha do tempo de cenas** (`cenas`, `indiceAtual`, `tipo: observado/previsto`, `rotulo`, `expansaoKm`).
    Sem equivalente.
11. **Limitações** (`LIMITACOES`, 5 frases). O backend tem `note` por resposta e `disclaimers` em `/exposure`,
    mas não uma lista de limitações do evento.
12. **Busca de localidade.** Sem busca por texto; o backend tem 8 cidades (o frontend tem 20, incluindo Porto Alegre),
    sem `uf` e sem o status afetada/risco/segura/fora.
13. **Área por município com contagem de polígonos.** Sem `poligonos`, e as rotas mais próximas estão em 503
    ou medem outra coisa (Sentinel-1).
14. **Lista de regiões com status do pipeline.** O backend lista 1 região, sem `status`/`detalhe`/`local`.
15. **Área cadastrada do usuário.** O backend guarda `city` (texto livre, uma cidade), não uma região monitorada.
16. **Regras de senha diferentes.** Login falso aceita 4 caracteres; o backend exige 6 no cadastro e confere a senha
    no login (qualquer e-mail não entra mais).
17. **Nomes e idioma dos campos.** O frontend usa português (`data`, `trilha`, `orbita`, `nome`, `municipio`);
    o backend usa inglês na maior parte (`date`, `track`, `flight_direction`, `name`) e valores em inglês
    (`ASCENDING`). `limites` `{sul, oeste, norte, leste}` e `[lat, lon]` × `bbox` `[lon, lat, lon, lat]`.
