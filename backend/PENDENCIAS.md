# Pendências do backend

O que ficou para depois. Ao concluir um item, apague-o daqui (ou marque `[x]`).

## Dados

### Histórico do Sentinel-1 (feito, falta usar no frontend)

- [x] Script `scripts/process_sentinel1.py` (Earth Engine) e rota `GET /api/regions/{id}/recurrence`.
- [ ] Mostrar no frontend: camada de classes no mapa, classe de cada cidade e a série mensal.
- [ ] Conferir o resultado contra as enchentes conhecidas (set/2023, nov/2023, mai/2024) e ajustar o limiar se precisar.

### Servir o NISAR já processado (`Fotos/nisar_taquari_50/`) (feito)

- [x] Rotas que servem as 19 passagens já processadas (PR #18): `GET /api/regions/{id}/passes`,
  `/passes/{n}/geojson`, imagens, municípios e exportação, lidas por `app/services/passes.py`.
- **Cuidado 1:** a área de água depende da trilha (órbita). A `053_D` mede de 1 a 5 km² e a `103_A` mede de 7 a 9 km², no mesmo rio. Só compare datas da **mesma trilha**.
- **Cuidado 2:** a área processada vai de −29,15 a −29,55 de latitude, mais ou menos de Muçum a Lajeado. Estrela, Bom Retiro do Sul e Taquari ficam de fora.
- **Em aberto:** de onde vêm o método, o limiar e a "janela da enchente" (03/07 a 28/08/2026) do catálogo. O notebook que gerou `Fotos/` não está no repositório; a origem dos grânulos está documentada no PR #11 (`docs/DATA.md`).

### Rotas de secas e enchentes

- [x] O "recorrente ou pontual?" do histórico já sai em `/recurrence`.
- [ ] Juntar o detalhe do NISAR (as 19 passagens) na mesma resposta, se der tempo. Todo dado simulado deve levar `"source": "demo"`.

## Escopo: conta governo e alertas (aguardando decisão da equipe)

O frontend não usa a conta governo nem os alertas (conferido por grep em `frontend/` em 2026-11-15); o código
fica no backend como base para a visão futura e não foi removido para a entrega final.

- [ ] Decidir se remove ou mantém:
  - a conta governo semente (`ensure_seed_gov`, `SEED_GOV_*` no `.env` e no `config.py`);
  - `require_gov` e a rota `POST /api/auth/gov-users`;
  - os alertas: `GET /api/alerts`, criar e desativar alerta, `GET /api/gov/export/{region_id}.csv`,
    `GET /api/me/city-status` e os alertas de exemplo (`ensure_demo_alerts`);
  - o cadastro público `POST /api/auth/register` (a tela de cadastro não o chama).
- [ ] Se remover: apagar também os testes (`test_alerts.py`, os de governo em `test_auth.py`), as variáveis
  `SEED_GOV_*` do `conftest.py` e do `.env.example`, e as menções no guia do projeto (raiz) e em `docs/`.

## Segurança (antes de publicar a API)

- [x] Trocar `JWT_SECRET` e `SEED_GOV_PASSWORD` no `.env` local.
- [x] Revisão de segurança (login, tokens, CORS), com testes em `tests/test_security.py`: 401 para token
  ausente, malformado, com outra assinatura, expirado e com alg `none`; CORS sem `*` e sem
  `Access-Control-Allow-Origin` para origem desconhecida; login com a mesma mensagem para e-mail ou senha
  errados; senha em bcrypt.
- [x] No Render (variável `RENDER`), a API não sobe com `JWT_SECRET`, `DEMO_USER_PASSWORD` ou `SEED_GOV_PASSWORD`
  vazio ou com o valor de exemplo.
- [x] Varredura de segredos no código, nos testes e no histórico do git: nada real. Foi por padrão de texto
  (gitleaks e trufflehog não estavam instalados); `.env` e `*.db` estão no `.gitignore`.
- [ ] Conferir no painel do Render: `JWT_SECRET` e `SEED_GOV_PASSWORD` sorteados, `DEMO_USER_PASSWORD` forte e
  diferente do de teste, `CORS_ORIGINS` com a URL da Vercel sem barra no fim. No Next (Vercel): `API_URL`,
  `DEMO_EMAIL` (igual a `DEMO_USER_EMAIL`) e `JWT_EXPIRE_MINUTES` (igual ao do backend).
- [ ] Banco persistente no deploy: hoje o SQLite do container some a cada deploy (contas e alertas).
- [ ] Rodar gitleaks ou trufflehog no histórico quando houver tempo de instalar.

## Ajustes pequenos

- [x] `pytest` passa a partir de uma instalação limpa (`pip install -r requirements.txt`).
- [x] `SEED_GOV_EMAIL` e `DEMO_USER_EMAIL` passam pela mesma validação do login (`EmailStr`) no `config.py`: um
  domínio reservado (`.test`, `.local`) é recusado ao subir, em vez de criar uma conta sem login.
- [x] `data_maturity` sai `"validated"` para a coleção `NISAR_L2_GCOV_V1` (no CMR, "NISAR Validated ...").
- [ ] Trocar `httpx` por `httpx2` nos testes (aviso de que o `httpx` está obsoleto no TestClient do Starlette).
- [ ] Conferir se `frontend/public/data/fallback/` bate com o que a API ao vivo devolve (fora do escopo do backend).

## Repositório

- [x] Backend integrado ao projeto (branch `teste-agente`, PR #1, já mergeado).
- [x] Branch `integracao-mockup` (login pela ponte do Next, conta demo, cadastro desativado): mergeada no PR #18.
- [x] PR #10 (branch `backend` → `main`) e PRs #11 a #15 mergeados.
- [x] PRs #16 e #17 fechados: o mockup do #17 entrou pelo #18.
- [x] Conteúdo do PR #21 (`validate_demo.py` e lista de pendências) trazido para a branch `final/hugo-backend`.
- [x] Branch `teste-agente` apagada.
- [ ] Apagar a branch `nisar-import` (dividida nos PRs #11 a #15).
