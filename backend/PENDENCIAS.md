# Pendências do backend

O que ficou para depois. Ao concluir um item, apague-o daqui (ou marque `[x]`).

## Dados

### Histórico do Sentinel-1 (não iniciado)

- [ ] Obter o histórico de radar Sentinel-1 do Vale do Taquari (desde 2014).
- **Por quê:** o objetivo do Water Waltz é a pessoa entender se o problema é **recorrente ou pontual**. As cenas NISAR da região só existem desde 17/06/2026, pouco para falar em recorrência.
- **Divisão entre satélites:**
  - **Sentinel-1 (banda C):** a memória longa. Com mais de 10 anos de imagens, conta quantas vezes cada ponto ficou alagado.
  - **NISAR (banda L):** o detalhe recente. Enxerga água embaixo da vegetação, umidade do solo e movimento do terreno.
- **Como:** processar **fora da API**, uma vez só (ex.: Google Earth Engine), e guardar o resultado pronto em `app/data/`, como um mapa de "% do tempo com água". A API só serve o resultado e indica a fonte.
- **Em aberto:** quem processa e com qual conta (Earth Engine ou NASA Earthdata).

### Servir o NISAR já processado (`Fotos/nisar_taquari_50/`)

- [ ] Criar rotas que sirvam as 19 passagens já processadas: `catalogo.json`, o GeoJSON de cheia e seca de cada data e as imagens.
- **Já existe:** `GET /api/regions/{id}/nisar-processed`, mas ela só serve as manchas geradas por `scripts/process_nisar.py` (hoje uma: 31/10/2026, trilha `103_A`). As 19 passagens de `Fotos/` ainda não passam pela API.
- **Cuidado 1:** a área de água depende da trilha (órbita). A `053_D` mede de 1 a 5 km² e a `103_A` mede de 7 a 9 km², no mesmo rio. Só compare datas da **mesma trilha**.
- **Cuidado 2:** a área processada vai de −29,15 a −29,55 de latitude, mais ou menos de Muçum a Lajeado. Estrela, Bom Retiro do Sul e Taquari ficam de fora.
- **Em aberto:** de onde vêm o método, o limiar e a "janela da enchente" (03/07 a 28/08/2026) do catálogo. O notebook que gerou `Fotos/` não está no repositório; a origem dos grânulos está documentada no PR #11 (`docs/DATA.md`).

### Rotas de secas e enchentes

- [ ] Definir e criar as rotas que respondem "recorrente ou pontual?", juntando o histórico do Sentinel-1 e o detalhe do NISAR.
- Depende dos dois itens acima. Todo dado simulado deve levar `"source": "demo"`.

## Segurança (antes de publicar a API)

- [ ] Trocar `JWT_SECRET` e `SEED_GOV_PASSWORD` no `.env` e nas variáveis do Render/Railway. Hoje são os valores de exemplo.
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
