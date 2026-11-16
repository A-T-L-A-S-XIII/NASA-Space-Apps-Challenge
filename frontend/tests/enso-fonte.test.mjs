// Selo ENSO (El Niño / La Niña) e etiqueta da fonte do dado.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

function loadComponents() {
  const win = { WW: {}, matchMedia: () => ({ matches: false }) };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read("../public/js/components.js"), win, { filename: "components.js" });
  return win.WW;
}

function loadApi(api) {
  const avisos = [], pedidos = [];
  const win = {
    WW: {}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    location: { origin: "http://localhost:3000" },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { warn: (m) => avisos.push(m) },
    fetch: async (url) => { pedidos.push(url); return api(url); },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read("../public/js/api.js"), win, { filename: "api.js" });
  return { api: win.WW.api, avisos, pedidos };
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ENSO = {
  live: true, source: "noaa-cpc", url: "https://www.cpc.ncep.noaa.gov/", fetched_at: "2026-11-15T12:00:00Z", count: 1,
  latest: { season: "ASO", year: 2026, month: "2026-09", total: 26.1, oni: -0.62, phase: "La Niña" },
  series: [], error: null, snapshot_date: null,
};

/* ------------------------------------------------------------ etiqueta */
test("etiqueta: um texto para cada origem do dado", () => {
  const WW = loadComponents();
  const t = (o, opts) => (WW.sourceLabel(o, opts) || {}).text;
  assert.equal(t("nisar"), "Real NISAR data");
  assert.equal(t("demo"), "Illustrative data");
  assert.equal(t("demo", { previsao: true }), "Simulated forecast");
  assert.equal(t("open-meteo"), "Open-Meteo forecast");
  assert.equal(t("local"), "Saved data (offline)");
  assert.equal(WW.sourceLabel("api"), null);
  assert.equal(WW.sourceLabel(undefined), null);
});

test("etiqueta: HTML com classe por tipo, prefixo para leitor de tela e nada sem origem conhecida", () => {
  const WW = loadComponents();
  assert.match(WW.sourceTag("nisar"), /class="src-tag src-real"/);
  assert.match(WW.sourceTag("nisar"), /<span class="sr-only">Source: <\/span>Real NISAR data/);
  assert.match(WW.sourceTag("local"), /src-offline/);
  assert.match(WW.sourceTag("demo", { previsao: true }), /src-demo.*Simulated forecast/);
  assert.equal(WW.sourceTag("api"), "");
});

/* ---------------------------------------------------------------- selo */
test("selo: fase e ONI com sinal e vírgula; cor pela fase", () => {
  const WW = loadComponents();
  const nina = WW.ensoBadgeHTML({ fase: "La Niña", oni: -0.62 }, "p1");
  assert.match(nina, /data-fase="la-nina"/);
  assert.match(nina, /La Niña/);
  assert.match(nina, /ONI −0.6/);
  assert.match(nina, /aria-expanded="false" aria-controls="p1"/);
  assert.match(nina, /id="p1"[^>]*hidden/);
  assert.match(WW.ensoBadgeHTML({ fase: "El Niño", oni: 1.24 }), /data-fase="el-nino"[\s\S]*ONI \+1\.2/);
  assert.match(WW.ensoBadgeHTML({ fase: "Neutro", oni: 0 }), /data-fase="neutro"[\s\S]*ONI 0.0/);
});

test("selo: sem dado (ou dado incompleto) não mostra nada", () => {
  const WW = loadComponents();
  assert.equal(WW.ensoBadgeHTML(null), "");
  assert.equal(WW.ensoBadgeHTML({ fase: "La Niña" }), "");
  assert.equal(WW.ensoBadgeHTML({ fase: "Outra", oni: 1 }), "");
});

/* ----------------------------------------------------- api.enso / explicacao */
test("api.enso: converte a última estação e marca o snapshot", async () => {
  const { api, pedidos } = loadApi(async () => resp(200, ENSO));
  const e = await api.enso();
  assert.deepEqual({ ...e }, { fase: "La Niña", oni: -0.62, estacao: "ASO 2026", mes: "2026-09", live: true, data_snapshot: null, origem: "noaa-cpc" });
  await api.enso();
  assert.deepEqual(pedidos, ["/api/climate/enso"]); // uma chamada só
  const salvo = loadApi(async () => resp(200, { ...ENSO, live: false, snapshot_date: "2026-11-01" }));
  const s = await salvo.api.enso();
  assert.equal(s.live, false);
  assert.equal(s.data_snapshot, "2026-11-01");
});

test("api.enso: API fora (502), rede caída ou sem estação dão null, sem plano B", async () => {
  const fora = loadApi(async () => resp(502, { detail: "O servidor está fora do ar." }));
  assert.equal(await fora.api.enso(), null);
  assert.equal(fora.avisos.length, 1);
  assert.ok(fora.pedidos.every((u) => !u.startsWith("data/fallback/")));
  const rede = loadApi(async () => { throw new TypeError("fetch failed"); });
  assert.equal(await rede.api.enso(), null);
  const vazio = loadApi(async () => resp(200, { ...ENSO, latest: null }));
  assert.equal(await vazio.api.enso(), null);
});

test("api.enso: depois de falhar, tenta de novo na próxima chamada", async () => {
  let n = 0;
  const { api } = loadApi(async () => (++n === 1 ? resp(502, {}) : resp(200, ENSO)));
  assert.equal(await api.enso(), null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal((await api.enso()).fase, "La Niña");
});

test("api.explicacao: El Niño and La Niña in English without a request; other topics come from the API", async () => {
  const { api, pedidos } = loadApi(async () => resp(200, { id: "radar", title: "Radar", summary: "Como o radar vê.", body: "…", icon: "sun" }));
  const nina = await api.explicacao("la-nina");
  assert.equal(nina.titulo, "La Niña");
  assert.match(nina.resumo, /^Cooling of the Pacific waters/);
  assert.deepEqual(pedidos, []);
  assert.deepEqual({ ...(await api.explicacao("radar")) }, { titulo: "Radar", resumo: "Como o radar vê." });
  assert.deepEqual(pedidos, ["/api/explain/radar"]);
});

/* ------------------------------------------------------------ visão futura */
test("notícias: selo de visão futura e nenhuma chamada de rede", () => {
  const js = read("../public/js/components.js");
  assert.match(js, /Future view/);
  const rail = js.slice(js.indexOf("WW.NewsRail ="), js.indexOf("WW.charts ="));
  assert.doesNotMatch(rail, /WW\.api|fetch/);
});

test("explorar: fora do Vale do Taquari aparece 'Em breve'", () => {
  const js = read("../public/js/explore.js");
  assert.match(js, /Coming soon: pilot in the Vale do Taquari/);
  assert.doesNotMatch(js, /Fora da sua região/);
});
