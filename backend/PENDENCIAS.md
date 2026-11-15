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
- **Cuidado 1:** a área de água depende da trilha (órbita). A `053_D` mede de 1 a 5 km² e a `103_A` mede de 7 a 9 km², no mesmo rio. Só compare datas da **mesma trilha**.
- **Cuidado 2:** a área processada vai de −29,15 a −29,55 de latitude, mais ou menos de Muçum a Lajeado. Estrela, Bom Retiro do Sul e Taquari ficam de fora.
- **Em aberto:** de onde vem a "janela da enchente" (03/07 a 28/08/2026) do catálogo.

### Rotas de secas e enchentes

- [ ] Definir e criar as rotas que respondem "recorrente ou pontual?", juntando o histórico do Sentinel-1 e o detalhe do NISAR.
- Depende dos dois itens acima. Todo dado simulado deve levar `"source": "demo"`.

## Ambiente (Docker)

- [ ] Colocar o projeto em Docker para que todos rodem a API e os testes com o mesmo ambiente.
- **Por quê:** o `pytest` falha na preparação se faltar alguma dependência. O `tests/conftest.py` roda `pipeline/make_dev_fixtures.py`, que precisa do `pillow` do `pipeline/requirements.txt`, e esse arquivo não é instalado junto com o `backend/requirements.txt`.
- **O que a imagem deve ter:** Python 3.12 (versão em que as dependências foram testadas), `backend/requirements.txt` e `pipeline/requirements.txt`.
- **Comandos esperados:** um para subir a API (`uvicorn app.main:app` na porta 8000) e outro para rodar o `pytest`, os dois sem instalar nada na máquina.
- Variáveis secretas (`JWT_SECRET`, `SEED_GOV_PASSWORD`) entram pelo `.env`, nunca na imagem.

## Segurança (antes de publicar a API)

- [ ] Trocar `JWT_SECRET` e `SEED_GOV_PASSWORD` no `.env`. Hoje são os valores de exemplo.
- [ ] Rodar uma revisão de segurança (login, tokens, CORS).

## Ajustes pequenos

- [ ] Datas (`created_at`) voltam sem fuso horário porque o SQLite não guarda o fuso. O frontend pode mostrar 3 horas de diferença.
- [ ] O e-mail da conta governo inicial (`SEED_GOV_EMAIL`) não passa pelo validador. Com domínio reservado (ex.: `.test`), a conta é criada mas não consegue fazer login.
- [ ] `data_maturity` fica `null` para cenas da coleção `NISAR_L2_GCOV_V1`, porque o ASF não diz a maturidade.
- [ ] Trocar `httpx` por `httpx2` nos testes (aviso de que o `httpx` está obsoleto no TestClient do Starlette).

## Repositório

- [x] Backend integrado ao projeto (branch `teste-agente`, PR #1). Continuar daqui, não da branch `backend`.
