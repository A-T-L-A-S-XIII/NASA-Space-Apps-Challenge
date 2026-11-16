// Simulated scenario (public/js/cenario.js): levels, alert and the notice that it is a simulation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(fileURLToPath(new URL("../public/js/cenario.js", import.meta.url)), "utf8");
const arquivo = (rel) => readFileSync(fileURLToPath(new URL(`../public/${rel}`, import.meta.url)), "utf8");

function load() {
  const win = {};
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: "cenario.js" });
  return win.WW.cenario;
}

test("little rain: calm, no alert and no mention of July", () => {
  const c = load()({ chuva_mm: 12, cidade: "Lajeado", dist_km: 0.8, data_julho: "2026-07-23" });
  assert.equal(c.nivel, "ok");
  assert.equal(c.label, "Calm");
  assert.equal(c.alerta, null);
  assert.equal(c.frase, "With 12 mm of rain in 7 days, the scenario is calm for Lajeado.");
});

test("watch level near the July water raises the alert; far away it does not", () => {
  const cenario = load();
  const perto = cenario({ chuva_mm: 45, cidade: "Lajeado", dist_km: 1.2, data_julho: "2026-07-23" });
  assert.equal(perto.nivel, "warn");
  assert.match(perto.frase, /1\.2 km from the town centre \(pass of 23 Jul\)/);
  assert.equal(perto.alerta.titulo, "Simulated alert · Lajeado");
  const longe = cenario({ chuva_mm: 45, cidade: "Estrela", dist_km: null });
  assert.equal(longe.nivel, "warn");
  assert.equal(longe.alerta, null);
  assert.match(longe.frase, /saw no water above normal near the town centre/);
});

test("heavy rain: alert even far from the water, with the official phone numbers", () => {
  const cenario = load();
  const c = cenario({ chuva_mm: cenario.TESTE_MM, cidade: "Encantado", dist_km: 9 });
  assert.equal(c.nivel, "alert");
  assert.match(c.alerta.texto, /150 mm in 7 days/);
  assert.ok(c.sugestoes.some((s) => s.includes("199") && s.includes("193")));
});

test("30 and 80 mm thresholds and invalid values", () => {
  const cenario = load();
  assert.equal(cenario({ chuva_mm: 29.9, cidade: "X" }).nivel, "ok");
  assert.equal(cenario({ chuva_mm: 30, cidade: "X" }).nivel, "warn");
  assert.equal(cenario({ chuva_mm: 80, cidade: "X" }).nivel, "alert");
  assert.equal(cenario({ chuva_mm: undefined, cidade: "X" }).chuva_mm, 0);
  assert.equal(cenario({ chuva_mm: -5, cidade: "X" }).nivel, "ok");
});

test("the notice says it is a simulation, not a flood forecast; the screen shows the Simulated tag", () => {
  const cenario = load();
  assert.match(cenario.AVISO, /^Simulation/);
  assert.match(cenario.AVISO, /It is not a flood forecast/);
  assert.match(cenario.AVISO, /30 and 80 mm/);
  const vale = arquivo("js/vale.js");
  assert.match(vale, /src-demo[^>]*>.*Simulated/);
  assert.match(vale, /WW\.cenario\.AVISO/);
  assert.match(arquivo("index.html"), /<script src="js\/cenario\.js"><\/script>\s*\n[\s\S]*js\/vale\.js/);
});
