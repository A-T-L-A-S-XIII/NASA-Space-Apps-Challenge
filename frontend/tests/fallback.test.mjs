// Plano B do api.js: com a API fora do ar, os dados vêm de public/data/fallback/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(fileURLToPath(new URL("../public/js/api.js", import.meta.url)), "utf8");
const arquivo = (rel) => readFileSync(fileURLToPath(new URL(`../public/${rel}`, import.meta.url)), "utf8");
const resposta = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) });

// api(url) responde pela API; os arquivos de data/fallback/ são lidos do disco
function loadApi(api) {
  const pedidos = [], avisos = [];
  const win = {
    WW: {}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    location: { origin: "http://localhost:3000" },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { warn: (m) => avisos.push(m) },
    fetch: async (url, opts) => {
      pedidos.push(url);
      return url.startsWith("data/fallback/") ? resposta(200, arquivo(url)) : api(url, opts);
    },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: "api.js" });
  return { api: win.WW.api, pedidos, avisos };
}

const foraDoAr = async () => resposta(502, "Bad Gateway");
const semRede = async () => { throw new TypeError("fetch failed"); };

test("API fora do ar (502): passagens vêm do plano B, com origem local e aviso no console", async () => {
  const { api, pedidos, avisos } = loadApi(foraDoAr);
  const r = await api.get("/api/nisar/passagens?mes=2026-07");
  assert.equal(r.origem, "local");
  assert.equal(r.itens.length, 5);
  assert.deepEqual(Object.keys(r.area_coberta), ["oeste", "sul", "leste", "norte"]);
  const p = r.itens[0];
  for (const campo of ["n", "data", "trilha", "pol", "agua_km2", "cheia_km2", "seca_km2", "granulo", "fonte"]) {
    assert.ok(campo in p, `falta ${campo}`);
  }
  assert.match(p.imagens.radar, /^data\/fallback\/nisar\/img_\d{2}_2026-07-\d{2}\/miniatura\.png$/);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /plano B/);
  assert.ok(pedidos.every((u) => !/^https?:/.test(u)), "só caminhos relativos");
});

test("sem rede: evento, municípios e GeoJSON de cheia/seca continuam funcionando", async () => {
  const { api } = loadApi(semRede);
  const [regiao, resumo, meta, mun, malha, mes, uma] = await Promise.all([
    api.get("/api/regions/vale-do-taquari"), api.get("/api/nisar/resumo?mes=2026-07"),
    api.get("/api/nisar/metadados"), api.get("/api/nisar/municipios?mes=2026-07"),
    api.get("/api/nisar/municipios/geojson"), api.get("/api/nisar/geojson?mes=2026-07"),
    api.get("/api/nisar/passagens/7/geojson")]);
  for (const r of [regiao, resumo, meta, mun, malha, mes, uma]) assert.equal(r.origem, "local");
  assert.ok(regiao.cities.length && regiao.river.coordinates.length);
  assert.equal(resumo.passagens, 5);
  assert.ok(["normal", "atencao", "alagamento"].includes(resumo.nivel));
  assert.equal(meta.periodo.passagens, 19);
  assert.ok(mun.municipios.every((m) => "nome" in m && "cheia_km2" in m && Array.isArray(m.por_data)));
  assert.ok(malha.features.length > 0);
  assert.ok(mes.features.length > 0);
  assert.ok(mes.features.every((f) => f.properties.data.startsWith("2026-07") && ["cheia", "seca"].includes(f.properties.classe)));
  assert.ok(uma.features.every((f) => f.properties.data === "2026-07-23"));
});

test("sem a API, a busca acha os municípios na malha local", async () => {
  const { api } = loadApi(foraDoAr);
  const r = await api.get("/api/lugares?q=laje", { cacheable: false });
  assert.equal(r.origem, "local");
  assert.equal(r.itens[0].nome, "Lajeado");
  assert.equal(r.itens[0].tipo, "município");
  assert.ok(r.erro_bairros);
});

test("404 e login não caem no plano B; previsão fora do ar dá erro claro", async () => {
  const { api, avisos } = loadApi(async (url) => (url.includes("/forecast") ? resposta(504, "")
    : resposta(404, JSON.stringify({ detail: "Passagem 99 não encontrada" }))));
  await assert.rejects(api.get("/api/nisar/passagens/99/geojson"), { status: 404, message: "Passagem 99 não encontrada" });
  await assert.rejects(api.get("/api/previsao"), { status: 504, message: /fora do ar \(erro 504\)/ });
  assert.equal(avisos.length, 0);
  const fora = loadApi(semRede);
  await assert.rejects(fora.api.login("a@b.c", "x"), { status: 0 });
});

test("API ligada: usa as rotas do main, converte os campos e repassa a origem", async () => {
  const passes = JSON.parse(arquivo("data/fallback/passagens.json"));
  const { api, pedidos, avisos } = loadApi(async (url) => {
    if (url === "/api/regions/vale-do-taquari/passes") return resposta(200, JSON.stringify(passes));
    if (url === "/api/regions/vale-do-taquari/forecast") {
      return resposta(200, JSON.stringify({ source: "open-meteo", live: true, kind: "Previsão do tempo", lat: -29.42, lon: -51.93,
        generated_at: "2026-11-15T18:00:00+00:00", total_rain_mm: 3, summary: "Pouca chuva.", error: null,
        days: [{ date: "2026-11-15", rain_mm: 3, rain_probability_pct: 40, tmin_c: 18, tmax_c: 27 }] }));
    }
    return resposta(404, "{}");
  });
  const r = await api.get("/api/nisar/passagens");
  assert.equal(r.origem, "nisar");
  assert.equal(r.itens.length, 19);
  assert.equal(r.itens[6].imagens.radar, "/api/static/nisar/img_07_2026-07-23/miniatura.png");
  const f = await api.get("/api/previsao");
  assert.equal(f.origem, "open-meteo");
  assert.deepEqual(Object.keys(f.dias[0]), ["data", "chuva_mm", "prob_chuva", "tmin", "tmax"]);
  assert.deepEqual(pedidos, ["/api/regions/vale-do-taquari/passes", "/api/regions/vale-do-taquari/forecast"]);
  assert.equal(avisos.length, 0);
  assert.equal(api.url("/api/nisar/exportar?formato=csv&mes=2026-07"), "/api/regions/vale-do-taquari/export?format=csv&month=2026-07");
  assert.equal(api.url("/api/nisar/geojson?mes=2026-07&download=true"), "/api/regions/vale-do-taquari/export?format=geojson&month=2026-07");
});

test("previsão: com a API sem dias (429 da Open-Meteo no Render), o navegador consulta a Open-Meteo direto", async () => {
  const { api, pedidos } = loadApi(async (url) => {
    if (url === "/api/regions/vale-do-taquari/forecast") {
      return resposta(200, JSON.stringify({ source: "open-meteo", live: false, kind: "Previsão do tempo", lat: -29.42, lon: -51.93,
        generated_at: null, total_rain_mm: 0, summary: "Sem previsão para os próximos dias.", days: [],
        error: "Falha ao consultar a Open-Meteo: 429 Too Many Requests" }));
    }
    if (url.startsWith("https://api.open-meteo.com/v1/forecast?")) {
      return resposta(200, JSON.stringify({ daily: { time: ["2026-11-15", "2026-11-16"], precipitation_sum: [14.2, 0.4],
        precipitation_probability_max: [90, 20], temperature_2m_min: [18, 17], temperature_2m_max: [26, 28] } }));
    }
    return resposta(404, "{}");
  });
  const f = await api.get("/api/previsao");
  assert.equal(f.origem, "open-meteo");
  assert.equal(f.dias.length, 2);
  // api.js roda em outro contexto (vm): compara pelo JSON, não pelo protótipo
  assert.deepEqual(JSON.parse(JSON.stringify(f.dias[0])), { data: "2026-11-15", chuva_mm: 14.2, prob_chuva: 90, tmin: 18, tmax: 26 });
  assert.equal(f.chuva_total_mm, 14.6);
  assert.equal(f.frase, "Chuva prevista de 14,6 mm nos próximos 2 dias, mais forte em 15/11.");
  assert.match(pedidos[1], /latitude=-29.42&longitude=-51.93&.*forecast_days=7/);
});

test("previsão: se a Open-Meteo direta também falhar, mostra o erro da API", async () => {
  const { api } = loadApi(async (url) => (url.includes("open-meteo") ? resposta(429, "{}")
    : resposta(200, JSON.stringify({ lat: -29.42, lon: -51.93, days: [], error: "Falha ao consultar a Open-Meteo: 429" }))));
  await assert.rejects(api.get("/api/previsao"), { status: 502, message: /429/ });
});

test("nenhum fetch fora de js/api.js", () => {
  for (const nome of ["app", "components", "explore", "globe", "home", "login", "modes", "radar-highlight", "vale"]) {
    assert.doesNotMatch(arquivo(`js/${nome}.js`), /\bfetch\s*\(|XMLHttpRequest|localhost:8000/, `${nome}.js`);
  }
});
