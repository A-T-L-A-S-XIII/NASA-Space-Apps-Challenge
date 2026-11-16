// Cenário simulado (public/js/cenario.js): níveis, alerta e o aviso de que é simulação.
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

test("pouca chuva: tranquilo, sem alerta e sem falar de julho", () => {
  const c = load()({ chuva_mm: 12, cidade: "Lajeado", dist_km: 0.8, data_julho: "2026-07-23" });
  assert.equal(c.nivel, "ok");
  assert.equal(c.label, "Tranquilo");
  assert.equal(c.alerta, null);
  assert.equal(c.frase, "Com 12 mm de chuva em 7 dias, o cenário fica tranquilo para Lajeado.");
});

test("atenção perto da água de julho dispara o alerta; longe, não", () => {
  const cenario = load();
  const perto = cenario({ chuva_mm: 45, cidade: "Lajeado", dist_km: 1.2, data_julho: "2026-07-23" });
  assert.equal(perto.nivel, "warn");
  assert.match(perto.frase, /a 1,2 km da sede \(passagem de 23\/07\)/);
  assert.equal(perto.alerta.titulo, "Alerta simulado · Lajeado");
  const longe = cenario({ chuva_mm: 45, cidade: "Estrela", dist_km: null });
  assert.equal(longe.nivel, "warn");
  assert.equal(longe.alerta, null);
  assert.match(longe.frase, /não viu água fora do normal perto da sede/);
});

test("chuva forte: alerta mesmo longe da água, com os telefones oficiais", () => {
  const cenario = load();
  const c = cenario({ chuva_mm: cenario.TESTE_MM, cidade: "Encantado", dist_km: 9 });
  assert.equal(c.nivel, "alert");
  assert.match(c.alerta.texto, /150 mm em 7 dias/);
  assert.ok(c.sugestoes.some((s) => s.includes("199") && s.includes("193")));
});

test("limites de 30 e 80 mm e valores inválidos", () => {
  const cenario = load();
  assert.equal(cenario({ chuva_mm: 29.9, cidade: "X" }).nivel, "ok");
  assert.equal(cenario({ chuva_mm: 30, cidade: "X" }).nivel, "warn");
  assert.equal(cenario({ chuva_mm: 80, cidade: "X" }).nivel, "alert");
  assert.equal(cenario({ chuva_mm: undefined, cidade: "X" }).chuva_mm, 0);
  assert.equal(cenario({ chuva_mm: -5, cidade: "X" }).nivel, "ok");
});

test("o aviso diz que é simulação e não previsão de enchente; a tela mostra o selo Simulado", () => {
  const cenario = load();
  assert.match(cenario.AVISO, /^Simulação/);
  assert.match(cenario.AVISO, /Não é previsão de enchente/);
  assert.match(cenario.AVISO, /30 e 80 mm/);
  const vale = arquivo("js/vale.js");
  assert.match(vale, /src-demo[^>]*>.*Simulado/);
  assert.match(vale, /WW\.cenario\.AVISO/);
  assert.match(arquivo("index.html"), /<script src="js\/cenario\.js"><\/script>\s*\n[\s\S]*js\/vale\.js/);
});
