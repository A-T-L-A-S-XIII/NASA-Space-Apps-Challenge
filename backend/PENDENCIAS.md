# Pendências do backend

O que ficou para depois. Ao concluir um item, apague-o daqui (ou marque `[x]`).

## Dados

### Histórico do Sentinel-1 (feito, falta usar no frontend)

- [x] Script `scripts/process_sentinel1.py` (Earth Engine) e rota `GET /api/regions/{id}/recurrence`.
- [ ] Mostrar no frontend: camada de classes no mapa, classe de cada cidade e a série mensal.
- [ ] Conferir o resultado contra as enchentes conhecidas (set/2023, nov/2023, mai/2024) e ajustar o limiar se precisar.

### Servir o NISAR já processado (`Fotos/nisar_taquari_50/`)

- [x] Catálogo das 19 passagens em `GET /api/regions/{id}/passes` e evento de julho/2026 em `/event` (dados copiados do frontend para `app/data/nisar/taquari/`).
- [ ] Servir o GeoJSON de cheia e seca de cada passagem e as imagens (hoje só a água nova de 11/07 → 23/07 e os quadros ficam no frontend).
- **Já existe:** `GET /api/regions/{id}/nisar-processed`, mas ela só serve as manchas geradas por `scripts/process_nisar.py` (hoje uma: 31/10/2026, trilha `103_A`). As 19 passagens de `Fotos/` ainda não passam pela API.
- **Cuidado 1:** a área de água depende da trilha (órbita). A `053_D` mede de 1 a 5 km² e a `103_A` mede de 7 a 9 km², no mesmo rio. Só compare datas da **mesma trilha**.
- **Cuidado 2:** a área processada vai de −29,15 a −29,55 de latitude, mais ou menos de Muçum a Lajeado. Estrela, Bom Retiro do Sul e Taquari ficam de fora.
- **Em aberto:** de onde vêm o método, o limiar e a "janela da enchente" (03/07 a 28/08/2026) do catálogo. O notebook que gerou `Fotos/` não está no repositório; a origem dos grânulos está documentada no PR #11 (`docs/DATA.md`).

### Rotas de secas e enchentes

- [x] O "recorrente ou pontual?" do histórico já sai em `/recurrence`.
- [ ] Juntar o detalhe do NISAR (as 19 passagens) na mesma resposta, se der tempo. Todo dado simulado deve levar `"source": "demo"`.

## Segurança (antes de publicar a API)

- [x] Trocar `JWT_SECRET` e `SEED_GOV_PASSWORD` no `.env` local.
- [ ] Cadastrar `JWT_SECRET`, `SEED_GOV_EMAIL`, `SEED_GOV_PASSWORD` e `CORS_ORIGINS` no Railway ao publicar.
- [ ] Banco persistente no deploy: hoje o SQLite do container some a cada deploy (contas e alertas).
- [ ] Rodar uma revisão de segurança (login, tokens, CORS).

## Ajustes pequenos

- [ ] O e-mail da conta governo inicial (`SEED_GOV_EMAIL`) não passa pelo validador. Com domínio reservado (ex.: `.test`), a conta é criada mas não consegue fazer login.
- [ ] `data_maturity` fica `null` para cenas da coleção `NISAR_L2_GCOV_V1`, porque o ASF não diz a maturidade.
- [ ] Trocar `httpx` por `httpx2` nos testes (aviso de que o `httpx` está obsoleto no TestClient do Starlette).

## Repositório

- [x] Backend integrado ao projeto (branch `teste-agente`, PR #1, já mergeado).
- [ ] Revisar e mergear o PR #10 (branch `backend` → `main`) e os PRs #11 a #15.
- [ ] Depois dos merges, apagar as branches `nisar-import` (dividida nos PRs #11 a #15) e `teste-agente`.
