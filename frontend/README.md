# Water Waltz · mockup navegável

Protótipo de interface para o desafio **Dancing with the SARs** (NASA Space Apps 2026), em HTML/CSS/JS estático e sem etapa de build.
As telas do **Vale do Taquari** usam os dados reais do backend (`backend/`). O globo e o drill-down de regiões continuam com valores de demonstração, marcados como "simulado".

## Como rodar

Rode os dois servidores, cada um no seu terminal:

```bash
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Depois abra http://localhost:3000. O Next.js só serve o mockup de `public/` e repassa `/api/*` para o FastAPI
(rewrite em `next.config.js`). O endereço do FastAPI vem de `API_URL`, lida no servidor (modelo em
`.env.example`; padrão `http://localhost:8000`). O navegador só vê caminhos relativos.

`public/js/api.js` é o único arquivo com `fetch`. As telas ainda pedem os caminhos do PR #17 (`/api/nisar/*`,
`/api/previsao`, `/api/lugares`); o `api.js` chama as rotas do main (`/api/regions/vale-do-taquari/passes`,
`/municipalities`, `/export`, `/forecast`, `/api/places`…) e devolve os campos com os nomes antigos, mais
`origem` (`"nisar"`, `"open-meteo"`… ou `"local"`).

**Plano B:** com o FastAPI fora do ar, o `api.js` usa `public/data/fallback/` e avisa no console. Previsão,
bairros, login e downloads precisam da API. Para atualizar os arquivos, com o FastAPI ligado:
`node scripts/gerar-fallback.mjs`.

O login usa `/api/auth/login`. Sem conta, use "Entrar como visitante".

## Telas

| Rota | Tela |
|---|---|
| `#/login` | Login: mapa do Atlântico Norte em tinta sobre papel kraft. Rolar ou mover o cursor faz cada região saltar do papel (Europa → Atlântico Norte → América do Norte). Valida cada campo, tem botão para mostrar a senha e entra via `/api/auth/login`. |
| `#/inicio` | Aba 1 · Visão geral: 1/4 do globo, frase central e subaba de notícias da região (conteúdo de exemplo). |
| `#/explorar/...` | Aba 2 · Explorar dados: continente, país, estado e município (valores simulados). No estado e no município aparece o atalho para o painel do Vale. |
| `#/vale` | Aba **Vale do Taquari**, sem botão na topbar. Entra-se pelo atalho "Abrir painel do Vale do Taquari" em Explorar dados (estado/município), pelo botão "Ver passagens" da pílula **Satélite** na Visão geral, pelo aviso do modo Aprofundado ou direto por `#/vale`. Conteúdo: mapa simplificado, busca por cidade ou bairro com a situação do lugar ("água nova perto", "pode ser afetada"), frase sobre julho, previsão, imagens e acesso aos dados detalhados. |
| `#/vale/dados` | **Dados detalhados**: mapa de mudança com camadas, comparador antes × depois, linha do tempo das 19 passagens (com reprodução), área alagada, "dois jeitos de medir", área por município, vegetação alagada, "como o mapa foi feito", downloads, exportação e metadados. |

As funções do Vale seguem o briefing, desenhadas com o visual original deste mockup.

## O que vem de onde

| Recurso do briefing | Fonte | Situação |
|---|---|---|
| Login | `POST /api/auth/login` | **já existia** |
| Mapa simplificado: rio, cidades, caixa da região | `GET /api/regions/vale-do-taquari` | **já existia** |
| Malha dos municípios no mapa | `GET /api/nisar/municipios/geojson` | **novo** (IBGE, gerado por `pipeline/build_vale_municipios.py`) |
| Frase sobre a situação de julho | `GET /api/nisar/resumo?mes=2026-07` | **novo**, calculado do `catalogo.json` |
| Previsão | `GET /api/previsao` | **novo**, Open-Meteo (previsão do tempo, não de enchente) |
| Busca por cidade | `GET /api/lugares?q=` | **novo**, municípios do IBGE (local) |
| Busca por bairro | `GET /api/lugares?q=` | **novo**, Nominatim/OpenStreetMap (externo) |
| Mapa de mudança (cheia/seca + radar) | `GET /api/nisar/geojson`, `/api/nisar/passagens/{n}/imagem/radar` | **novo**, lê `Fotos/nisar_taquari_50` |
| Área alagada por passagem | `GET /api/nisar/passagens?mes=` | **novo** |
| Área alagada por município | `GET /api/nisar/municipios?mes=` | **novo**, atribui cada polígono ao município pelo centro |
| Vegetação alagada | `GET /api/nisar/vegetacao-alagada` → 501 | **sem dado**: as cenas são só HH; precisa de HV e reprocessamento |
| Download GeoJSON | `/api/nisar/passagens/{n}/geojson?download=true`, `/api/nisar/geojson?download=true` | **novo** |
| Exportação | `/api/nisar/exportar?formato=csv\|json` | **novo** |
| Metadados | `GET /api/nisar/metadados` | **novo** |
| Imagem de radar | `/api/nisar/passagens/{n}/imagem/{radar,slide}` | **novo** (arquivos do processamento) |
| Imagem ilustrada | `assets/img/vale-ilustrado.webp` | ilustração feita a partir do radar de 23/07 |
| Comparador antes × depois e linha do tempo | `/api/nisar/passagens` (todas as 19) + imagens de radar | **novo** |
| Situação do município | `/api/lugares` + sedes de `/api/regions/vale-do-taquari` + polígonos de cheia | calculado no navegador a partir de dados do backend |

As rotas antigas de radar (`/api/timeline`, `/api/stats`, `/api/layers`…) dependem de `data/demo/`, que ainda não existe. Por isso as telas do Vale usam as rotas `/api/nisar/*`.

## Visual (`css/tokens.css`)

O visual é o original do mockup, derivado das referências da pasta do projeto: verde-floresta, amarelo-terra, menta e papel kraft; fontes Urbanist, Instrument Serif e Dela Gothic One; imagens de musgo e pedra. As telas do Vale usam só esses tokens e componentes. As únicas cores novas são as dos dados: menta para cheia e laranja-ferrugem para seca.

### Tela de login

- **Fundo:** o token `--login-gradient` usa só azuis que já existem no sistema: `--blue-600`, `--indigo-700`, `--deep-900` e uma luz em `--teal-500` (paletas *light mode 1* e *dark mode 1*). Por cima vai o mapa do Atlântico em tinta branca (`*-ink.webp`), gerado a partir das imagens originais.
- **Fontes:** `--font-login-title` é Space Grotesk 700; `--font-login-body` é `"DW Sans", "DM Sans", …`. Não existe "DW Sans" no Google Fonts: se a fonte estiver instalada, ela é usada; senão vale a DM Sans, carregada no `index.html`.
- **Logo:** `WW.brand({ variant })` usa a logo oficial com o fundo removido. `logo-on-dark.webp` vem de `Logo-black.jpeg` (texto claro) e `logo-on-light.webp` de `Logo-white.jpeg` (texto escuro). O login usa a variante para fundo escuro; a barra superior troca a variante conforme o tema.

### Movimento adaptável (`js/modes.js` → `WW.motion`)

- `full` por padrão. Fica `reduced` com `prefers-reduced-motion: reduce`, Save-Data ou `deviceMemory ≤ 2`.
- No modo `reduced`: o cursor não move o login, não há interpolação por quadro, o globo não gira e só redesenha quando algo muda, e o parallax e as gotas da Visão geral ficam desligados.
- Em qualquer modo, o loop do globo e o do login param quando a aba vai para segundo plano.
- Todas as `@keyframes` animam só `transform` e `opacity`. O anel do aviso do mapa deixou de usar `box-shadow`. No login, a trilha da gota é desenhada uma vez e a gota anda por `transform`; nenhum filtro é animado.

### Modos de dados: Lite e Aprofundado (`js/modes.js` → `WW.mode`)

- O seletor fica na barra superior. A escolha é salva no navegador (`localStorage: ww-mode`), com a mesma conta e o mesmo login, e o padrão é **Lite**.
- **Lite:** a interface de sempre, sem nenhuma mudança.
- **Aprofundado:** acrescenta às telas do Vale um painel técnico (sistema de coordenadas, área coberta, série completa das 19 passagens com grânulos, polígonos com centróide e município, série diária da previsão) e o botão **Exportar dados**.
- **Exportação** (`WW.exportData`): JSON com o pacote completo (proveniência, citação, CRS, unidades), CSV das passagens e CSV dos polígonos. O arquivo é gerado no navegador e só lê campos públicos do radar; nenhum dado da conta (nome, e-mail, buscas, token) entra.

### Testes

```bash
npm test
```

Os testes cobrem: a alternância de modos (padrão, persistência, evento, valor inválido), a exportação (formatos, escape do CSV, ausência de dados do usuário) e o movimento reduzido (`prefers-reduced-motion`, Save-Data, memória, `@keyframes` só com transform/opacity, regras do login e do globo).
