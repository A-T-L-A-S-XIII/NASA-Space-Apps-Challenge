// Gera o plano B do mockup: cópias das respostas da API em public/data/fallback/
// e as imagens das passagens (miniaturas de todas; painéis só do mês da demo).
// Uso, com o FastAPI ligado:  node scripts/gerar-fallback.mjs   (API_URL e NISAR_FOTOS_DIR opcionais)
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = (process.env.API_URL || "http://localhost:8000").replace(/\/$/, "");
const R = `${API}/api/regions/vale-do-taquari`;
const MES = "2026-07";
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fotos = process.env.NISAR_FOTOS_DIR || path.join(raiz, "..", "Fotos", "nisar_taquari_50");
const saida = path.join(raiz, "public", "data", "fallback");

const ARQUIVOS = {
  "regiao.json": R,
  "passagens.json": `${R}/passes`,
  "evento.json": `${R}/export?format=json`,
  "cheia-seca.geojson": `${R}/export?format=geojson`,
  [`municipios-${MES}.json`]: `${R}/municipalities?month=${MES}`,
  "municipios-malha.geojson": `${R}/municipalities/geojson`,
};

mkdirSync(saida, { recursive: true });
const baixados = {};
for (const [nome, url] of Object.entries(ARQUIVOS)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  baixados[nome] = await r.json();
  writeFileSync(path.join(saida, nome), JSON.stringify(baixados[nome]) + "\n");
  console.log("ok", nome);
}

for (const p of baixados["passagens.json"].passes) {
  const imagens = [p.images.radar, p.date.startsWith(MES) ? p.images.slide : null].filter(Boolean);
  for (const u of imagens) {
    const rel = u.replace("/api/static/nisar/", "");
    mkdirSync(path.join(saida, "nisar", path.dirname(rel)), { recursive: true });
    copyFileSync(path.join(fotos, rel), path.join(saida, "nisar", rel));
  }
}
console.log("ok imagens");
