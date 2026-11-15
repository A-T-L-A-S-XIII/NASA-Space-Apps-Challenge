# Contrato de integração frontend ↔ backend

Levantamento feito em 15/11/2026, antes de mexer em qualquer lógica. Atualizado no mesmo dia, depois que o
backend passou a servir o evento NISAR da equipe (`/event`, `/passes` e datas por dia): as lacunas 1, 2, 3, 5
e 6 foram resolvidas ou reduzidas (veja a seção 2).

- **Frontend:** `frontend/` (Next.js 15, JavaScript). Hoje roda sem backend: toda leitura de dados passa por
  `lib/nisarService.js`, e a sessão é falsa (`lib/sessao.js`).
- **Backend:** `backend/` (FastAPI). Fontes conferidas: `app/schemas.py`, `app/routers/*.py`,
  `backend/frontend-api.ts` e o `/openapi.json` do servidor rodando (32 rotas).
- **URL da API no frontend:** `NEXT_PUBLIC_API_URL` (ver `frontend/.env.local.example`).
  O exemplo de uso em `backend/frontend-api.ts` já usa esse nome.

## 1. Tabela de funções → endpoints

Legenda da coluna "Situação": ✅ cobre · 🟡 cobre em parte (precisa adaptar) · ❌ não existe no backend.

### `lib/nisarService.js`

| Função (quem usa) | O frontend espera | Endpoint que substitui | O backend devolve | Falta ou muda de nome | Situação |
|---|---|---|---|---|---|
| `obterEvento()` (`/painel`, `/analise`, `PalcoMapa`, `Metadados`) | `{ nisar, cenas, indiceAtual, limites, centro, arquivos, limitacoes }`. `nisar` = conteúdo de `data/taquari/dados.json`. `cenas` = 4 itens `{ data, tipo, rotulo, radar, expansaoKm }`. `limites` = `{ sul, oeste, norte, leste }`. `arquivos` = URLs das imagens. `limitacoes` = frases. | `GET /api/regions/vale-do-taquari/event` | `NisarEvent`: **os mesmos campos do `dados.json`** (`evento`, `local`, `satelite`, `produto`, `data_antes`, `data_depois`, `agua_antes_km2`, `agua_depois_km2`, `area_alagada_km2`, `limites_leaflet`, `arquivos`, `fonte`) + `region_id`, `source: "nisar"`, `note`, `poligonos`. | `nisar` sai direto da resposta. `limites`/`centro` continuam derivados de `limites_leaflet` no frontend. `arquivos` traz só os nomes: as imagens seguem em `public/nisar/`. Sem equivalente: `cenas`, `indiceAtual` (linha do tempo com previsão) e `limitacoes`. | 🟡 |
| `obterAlagamento()` (`/painel`, `/analise`) | GeoJSON com 134 polígonos, `properties.classe`. O frontend acrescenta `area_km2`, `centroide`, `totalKm2` e `classes` em `lib/taquari.js`. | `GET /api/regions/vale-do-taquari/water-mask?date=2026-07-23` | `WaterMaskCollection` com `source: "nisar"`: 1 feature (MultiPolygon, a união dos 134 polígonos de água nova), `water_area_km2` ≈ 4,14, `cidades_atingidas` (água a até 1,2 km do centro), `note`. | Os polígonos vêm **unidos** numa feature só, sem `classe` por polígono (o frontend usa `classes.includes('vegetacao_alagada')`; hoje só existe `alagado`). Se o frontend precisar dos polígonos separados, falta uma rota para o `area_alagada.json` cru. | 🟡 |
| `obterPrevisao()` (`/painel`, `PainelBusca`) | `{ probabilidade, intervalo: [min, max], horizonteHoras, nivel, areaPorCena: [4 números], fatores: [frases] }` — **simulada**. | — | — | O backend não faz previsão de propósito (os avisos dizem "não é previsão"). Continua local e marcada como simulada. | ❌ |
| `buscarLocalidade(texto)` (`PainelBusca`) | Até 5 itens `{ nome, uf, lon, lat, status: 'afetada'\|'risco'\|'segura'\|'fora', distanciaKm, areaProximaKm2 }`. | `GET /api/regions/vale-do-taquari` (lista `cities`) + `GET /api/exposure?lat=&lon=` | `Region.cities`: 8 cidades `{ id, name, lat, lon }`. `Exposure`: `inside_aoi`, `latest.state`, `nearest_candidate_water.distance_m`, `history`, `statements`. | A busca de texto não existe: filtrar `cities` no frontend. `nome` → `name`, sem `uf`. O frontend tem 20 localidades e o backend 8. `status` precisa ser derivado (`inside_aoi=false` → `'fora'`; distância → afetada/risco/segura). `distanciaKm` ← `distance_m / 1000`. Sem `areaProximaKm2`. **`/api/exposure` hoje responde 503** (falta `data/demo/manifest.json`). | 🟡 |
| `obterAreaPorMunicipio()` (`/analise`, `AreaPorMunicipio`) | Lista `{ municipio, areaKm2, poligonos }`, ordenada pela área. | `GET /api/stats` (`per_locality`) ou `GET /api/regions/vale-do-taquari/recurrence?geometry=false` (`cities`) | `Stats.per_locality[]`: `locality_id`, `name`, `per_date[{ date_id, candidate_water_km2, valid_fraction }]`. `Recurrence.cities[]`: `city_id`, `name`, `class`, `flooded_share`. | `municipio` → `name`, `areaKm2` → `candidate_water_km2` da data escolhida. Sem `poligonos`. `/api/stats` hoje responde 503. `recurrence` é Sentinel-1 histórico (fração alagada, não km²). | 🟡 |
| `obterPassagens()` (`/analise`, `PassagensNisar`, `Metadados`) | `data/taquari/passagens.json`: `passagens[]` `{ n, data, trilha, agua_km2, cheia_km2, seca_km2, na_janela_da_enchente, granulo, img, orbita }`, `puladas[]`, `limites`. | `GET /api/regions/vale-do-taquari/passes` | `NisarPasses`: **os mesmos campos do `passagens.json`** + `region_id`, `source: "nisar"`, `note`, `count`. | Nada falta. `img` é só o nome: o quadro segue em `public/nisar/passagens/`. (`/nisar-processed` é outra coisa: as manchas do `scripts/process_nisar.py`.) | ✅ |
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

1. ~~**Datas por dia.**~~ **Resolvido.** `/timeline`, `/water-mask`, `/water-mask/frames` e `/compare` aceitam
   AAAA-MM-DD além de AAAA-MM. `/compare?before=2026-07-11&after=2026-07-23` dá `delta_km2` ≈ 4,14 (água nova).
   Dia sem passagem real volta como o mês dele.
2. ~~**Catálogo das 19 passagens.**~~ **Resolvido:** `GET /api/regions/{id}/passes`, com os campos do `passagens.json`.
3. ~~**Metadados do evento.**~~ **Resolvido:** `GET /api/regions/{id}/event`, com os campos do `dados.json`.
4. **Id da região.** Frontend usa `taquari`; backend usa `vale-do-taquari` (`/api/regions/taquari` → 404).
   O `areaCadastrada: 'taquari'` da sessão e o `id` em `data/regioes.js` precisam ser mapeados.
5. **NISAR real de julho/2026: resolvido por dia.** `?date=2026-07-11` e `2026-07-23` devolvem o dado real
   (`source: "nisar"`). Pedindo o **mês** `2026-07`, ainda vem demo: a série mensal não mistura água nova com
   água total. O frontend deve pedir por dia.
6. **Água nova × água total: reduzido.** Nos dias do evento, a mancha e o `delta_km2` são a água **nova**,
   como no frontend; a água total de cada cena está no `/event`. Falta `classe` por polígono (a mancha vem unida).
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
