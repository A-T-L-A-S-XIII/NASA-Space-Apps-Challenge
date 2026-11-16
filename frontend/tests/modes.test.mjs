// Alternância de modos de dados: Lite (padrão) e Aprofundado, na mesma conta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModes } from "./helpers.mjs";

test("Lite é o padrão para quem nunca escolheu", () => {
  const { WW, attrs } = loadModes();
  assert.equal(WW.mode.get(), "lite");
  assert.equal(WW.mode.isDeep(), false);
  assert.equal(attrs["data-mode"], "lite");
});

test("trocar para Aprofundado grava a escolha, marca o <html> e avisa a interface uma vez", () => {
  const { WW, storage, events, attrs } = loadModes();
  assert.equal(WW.mode.set("aprofundado"), true);
  assert.equal(WW.mode.isDeep(), true);
  assert.equal(storage.get("ww-mode"), "aprofundado");
  assert.equal(attrs["data-mode"], "aprofundado");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "ww:mode");
  assert.equal(events[0].detail.mode, "aprofundado");
  // repetir o mesmo modo não dispara outro evento
  assert.equal(WW.mode.set("aprofundado"), false);
  assert.equal(events.length, 1);
});

test("a escolha vale na próxima visita (mesma conta, sem cadastro separado)", () => {
  const { WW } = loadModes({ stored: { "ww-mode": "aprofundado" } });
  assert.equal(WW.mode.get(), "aprofundado");
});

test("voltar para Lite funciona e valor inválido é recusado", () => {
  const { WW, storage } = loadModes({ stored: { "ww-mode": "aprofundado" } });
  WW.mode.set("lite");
  assert.equal(storage.get("ww-mode"), "lite");
  assert.throws(() => WW.mode.set("expert"), /Invalid mode/);
  assert.equal(WW.mode.get(), "lite");
});

test("valor salvo desconhecido cai para Lite", () => {
  const { WW } = loadModes({ stored: { "ww-mode": "qualquer" } });
  assert.equal(WW.mode.get(), "lite");
});

test("seletor tem os dois modos como radio, com o atual marcado", () => {
  const { WW } = loadModes({ stored: { "ww-mode": "aprofundado" } });
  const html = WW.mode.selector();
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /data-mode="lite" aria-checked="false"/);
  assert.match(html, /data-mode="aprofundado" aria-checked="true"/);
});
