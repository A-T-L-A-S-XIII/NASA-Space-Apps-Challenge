# Water Waltz — Monitoramento de enchentes com NISAR

Protótipo front-end da equipe **Dancing with SARs** para o **NASA Space Apps Challenge**.
Roda localmente, sem backend. Usa **dados reais do NISAR** (banda L, HH) do Vale do Taquari (RS)
processados pela equipe, mais uma **previsão simulada**.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # versão de produção
```

Requer Node 18.18+ (Next.js 15, React 19).
Login: qualquer e-mail válido + senha com 4 ou mais caracteres.

## Fluxo

1. **/** — Login. Ilustração de gotas e ondas (SVG próprio). Botão claro/escuro no canto.
2. **/painel**
   - Logo após o login, um **pop-up** lembra a área cadastrada ("Você cadastrou o Vale do Taquari")
     e pergunta se a pessoa quer abri-la ou verificar outra área (uma vez por login).
   - **Globo em calota** no canto inferior esquerdo, parado e focado na região escolhida, com o cartão
     **"Região em foco"** (CTA) no espaço vazio.
   - **Lateral com 3 ícones** (uma página por vez): Regiões · Previsão · Buscar.
   - "Ver enchente no mapa" faz o mergulho até o **mapa regional** (Leaflet) com as camadas
     **Ilustrado** (mapa interpretado a partir do radar), **Mapa** (tiles OSM/CARTO, só com internet) e
     **Radar** (imagem NISAR original), os 134 polígonos reais de água nova, linha do tempo
     (11/07 e 23/07 reais + 29/07 e 04/08 simulados) e o botão **"Voltar ao mapa-múndi"**.
3. **/analise** — Região e data no topo, imagem do radar, números de área alagada, mapa de mudança
   antes/depois, download do GeoJSON, como o mapa foi feito, **19 passagens do NISAR** (player + gráfico
   por órbita), área por município e metadados. (Vegetação alagada só aparece se a classe existir.)

## Temas (claro e escuro)

O botão sol/lua alterna e lembra a escolha (`localStorage`); sem escolha, segue o sistema.
O `<html>` recebe `data-tema` (escuro|claro) e cada página marca `data-tela` (login|painel|analise).
As paletas ficam em **`styles/temas.css`**:

| Tela | Escuro | Claro |
|---|---|---|
| Login | azul/lavanda `#1F3667 #C7C8D7 #3C5B91 #2F626C #716591` | salmão/petróleo `#BB8278 #3B6572 #8B3727 #A87659 #593A2F #0B5762` (fundo creme derivado) |
| Painel (globo, lateral, mapa) | verde `#142314 #88CE71 #007387 #50512D` — **só o planeta é azul** | salmão/petróleo |
| Análise | verde | "terra": base salmão/petróleo + janelas `#5A2D2D #9A5C42 #C8B496 #B8C6C0 #6F829E` |

Cores derivadas só onde o contraste exige (AA): `#2AA3B8`, `#7E7F4B`, `#9A90BA`, `#A9ABC2`.
O globo (canvas) lê as cores das variáveis `--globo-*` e se repinta quando o tema muda.
O gráfico das passagens usa pares validados para daltonismo em cada fundo
(escuro `#2AA3B8/#A8962A`, terra `#00879F/#B0582C`).

## Estrutura

```
app/                    páginas (layout, login, painel, analise)
components/             componentes de interface (PalcoMapa, TrilhoLateral, BoasVindas, GotasNanquim, PassagensNisar…)
data/regioes.js         regiões monitoradas (só o Taquari tem cenas)
data/taquari.js         cenas, previsão (simulada), localidades, limitações
data/taquari/           metadados NISAR, GeoJSON e catálogo das 19 passagens
lib/nisarService.js     ★ camada de dados — único ponto de troca por dados reais
lib/globo.js            globo em calota (canvas + d3-geo) com mergulho animado
lib/mapaRegional.js     mapa regional (Leaflet)
lib/tema.js, temaScript.js  tema claro/escuro (script no <head> evita piscar)
lib/sessao.js           sessão falsa do protótipo + área cadastrada
styles/                 tokens.css (verde padrão), temas.css (paletas por tela), base, login, painel, analise
public/nisar/           mapa ilustrado, radar (webp), máscaras, GeoJSON, 19 quadros das passagens
public/fonts/           Space Grotesk e DM Sans (OFL)
scripts/interpretar_radar.py  lê o radar e gera o mapa ilustrado (numpy/scipy)
estatico/               gera a versão estática (mesmo React, sem Next.js) para pré-visualização
```

## Integração com dados reais

Procure por **`🔌 INTEGRAÇÃO`** no código:

| Onde | O que substituir |
|---|---|
| `lib/nisarService.js` → `obterEvento()` / `obterAlagamento()` / `obterPassagens()` | saída do pipeline a cada nova passagem (4–8 dias somando as duas órbitas) |
| `lib/nisarService.js` → `obterPrevisao()` | API do modelo de previsão (hoje simulada) |
| `lib/sessao.js` → `areaCadastrada` / `app/painel/page.jsx` → região inicial | perfil do usuário / geolocalização |
| `lib/taquari.js` → `areaPorMunicipio()` | interseção com a malha municipal do IBGE (hoje: sede mais próxima) |
| `lib/taquari.js` → `buscarLocalidades()` | geocodificação (API de localidades do IBGE) |
| `lib/mapaRegional.js` | mosaico NISAR (COG/WMTS) no lugar das imagens fixas, para outras regiões |
| `scripts/interpretar_radar.py` | rodar no pipeline a cada nova cena |

> **Dois números de área:** os 4,2 km² comparam duas cenas da mesma órbita (11/07 → 23/07);
> a série das 19 passagens mede cada cena contra o normal da época (0,2 km² "acima do normal" em 23/07).
> Os dois estão certos e respondem perguntas diferentes — a tela explica isso.

> Dados de radar: NASA/ISRO NISAR via ASF DAAC. Globo: Natural Earth (domínio público), via `world-atlas`.
> Tiles: © OpenStreetMap, © CARTO.

## Acessibilidade

Revisado com axe-core (WCAG 2.2 AA) em todas as telas, nos dois temas: contraste, foco visível,
navegação por teclado (abas, trilho, régua das passagens, pop-up nativo `<dialog>`), alvos de 44px,
"reduzir movimento" respeitado e layout testado em 375px.
