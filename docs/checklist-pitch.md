# Checklist do pitch

## Endereços

| Serviço | URL |
|---|---|
| Site (Next.js na Vercel) | `https://__________.vercel.app` *(preencher depois do deploy)* |
| API (FastAPI no Render) | `https://__________.onrender.com` *(preencher depois do deploy; `/health` e `/docs` servem para conferir)* |

O navegador só abre o site. Quem chama a API é o servidor do Next.js (variável `API_URL` na Vercel).

## Antes de apresentar

- [ ] **Acordar a API 5 minutos antes.** No plano grátis do Render, o FastAPI "dorme" depois de 15 minutos
      sem uso e leva perto de 1 minuto para voltar. Abra `https://<api>.onrender.com/health` e espere aparecer
      `{"status":"ok"}`. Depois, abra o site uma vez e entre, para o Next já ter falado com a API.
- [ ] Se a API ainda estiver acordando, o login entra numa **sessão offline** (só com o e-mail da demo) e as
      telas do Vale usam os dados salvos, com a etiqueta "Dado salvo (offline)". Dá para apresentar, mas sem o
      selo El Niño, a previsão e a busca de bairros.
- [ ] Abrir o site numa janela anônima e fazer o roteiro abaixo uma vez.
- [ ] Deixar o plano de "a internet caiu" pronto no computador de quem apresenta (ver o fim desta página).

## Senha da conta de demonstração

Há uma conta só: `demo@waterwaltz.dev`. A senha **não fica no repositório**:

- a fonte é a variável `DEMO_USER_PASSWORD` do serviço no painel do Render (Environment), visível para quem
  tem acesso ao projeto lá;
- a equipe guarda uma cópia em: `__________` *(cofre de senhas da equipe; preencher)*.

A conta é recriada a cada startup do FastAPI a partir de `DEMO_USER_*` (o disco do plano grátis não guarda
o SQLite entre deploys). Trocar a senha no Render e reiniciar o serviço basta.

## Roteiro de cliques

1. **Login:** `demo@waterwaltz.dev` e a senha. Comentar o mapa que salta do papel ao mexer o cursor.
2. **Visão geral:** apontar o selo **"Pacífico agora: El Niño"** (ONI da NOAA) na barra e a pílula
   **Satélite · NISAR** (21 imagens desde jun/2026, revisita a cada 12 dias).
3. **Explorar dados:** descer América do Sul → Brasil → Rio Grande do Sul → um município do Vale e clicar em
   **"Abrir painel do Vale do Taquari"**.
4. **Vale do Taquari:** frase sobre julho, previsão, busca por cidade ou bairro. Entrar em **Dados detalhados**.
5. **Mapa de mudança:** cheia e seca sobre a imagem de radar; mostrar o **marca-texto** contornando onde a
   água apareceu e onde secou.
6. **Comparador antes × depois:** **11/07 × 23/07**.
7. **Linha do tempo das 19 passagens:** apertar reproduzir.
8. **Área por município:** tabela com cheia e seca em km².
9. **Modo Aprofundado** (seletor na barra superior): painel técnico com CRS, grânulos e polígonos; clicar em
   **Exportar dados** (JSON e CSV gerados no navegador).

Se perguntarem:

- **Cadastro:** "Criar conta" no login mostra o formulário, valida e avisa que está desativado na demo.
- **Notícias:** a subaba da Visão geral é **visão futura**, com conteúdo de exemplo.

Frase de segurança: é um indicador de água candidata visto pelo radar, não um mapa validado de enchente, não é
previsão e não serve para decidir rota ou evacuação.

## Se a internet cair

**Com internet ruim, mas o site abrindo:** seguir o roteiro. Se a API não responder, o login entra em modo
offline e o Vale usa os dados salvos (`frontend/public/data/fallback/`).

**Sem internet nenhuma:** rodar os dois serviços no notebook (preparar antes, com internet, porque o
`npm install` e o `pip install` baixam pacotes):

```bash
cd backend && OFFLINE_MODE=true .venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm run build && npm start
```

e abrir http://localhost:3000. Com `OFFLINE_MODE=true` a API não chama ninguém: ASF e NOAA vêm dos snapshots
em `backend/app/data/snapshots/` (o selo El Niño continua), e as 19 passagens vêm de `Fotos/`. Só a
previsão do tempo e a busca de bairros ficam sem dado.

Na véspera, com internet, atualizar os snapshots:

```bash
cd backend && .venv/bin/python scripts/snapshot.py
```

**Último recurso:** o vídeo do pitch.
