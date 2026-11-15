# Versão estática (sem Next.js)

Gera uma página única que monta as **mesmas páginas React** do app com um roteador por hash
(`#login`, `#painel`, `#analise`). Útil para hospedar como página estática.

```bash
npm install --no-save esbuild
npx esbuild estatico/entrada.jsx --bundle --minify --format=iife --jsx=automatic \
  --loader:.js=jsx --loader:.png=dataurl \
  --alias:next/link=./estatico/shims/next-link.jsx --alias:next/navigation=./estatico/shims/next-navigation.js \
  --define:process.env.NODE_ENV='"production"' --external:/fonts/* --outdir=estatico/dist
```

Depois crie um `index.html` com `<div id="app">`, `window.__ESTATICO__ = true`, o CSS e o JS gerados,
e copie `public/img`, `public/nisar` e `public/fonts` para o lado (troque `url('/fonts/` por `url('fonts/` no CSS).
