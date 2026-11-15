// Marca-texto de alagamento (azul) e seca (laranja) sobre as imagens de radar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(fileURLToPath(new URL("../public/js/radar-highlight.js", import.meta.url)), "utf8");
const ctx = { window: { WW: { api: {} } } };
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const HL = ctx.window.WW.radarHighlight;

const COVER = { oeste: -52.15, sul: -29.55, leste: -51.8, norte: -29.15 };
const COL = { cheia: "#2F6BFF", seca: "#FF8A1F" };
const sq = (lon, lat, d = 0.002) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
const FC = { features: [
  { geometry: sq(-51.9, -29.2), properties: { classe: "cheia" } },
  { geometry: sq(-52.0, -29.4), properties: { classe: "seca" } },
  { geometry: sq(-51.95, -29.3), properties: { classe: "outra" } },
] };

test("alagamento em azul e seca em laranja, a partir da classe do backend", () => {
  const svg = HL.svg(FC, COVER, "radar", COL);
  assert.match(svg, /fill="#2F6BFF"[^>]*data-classe="cheia"/);
  assert.match(svg, /fill="#FF8A1F"[^>]*data-classe="seca"/);
  assert.equal((svg.match(/data-classe=/g) || []).length, 2, "classe desconhecida é ignorada (sem critério inventado)");
});

test("baixa opacidade: o radar continua visível por baixo", () => {
  assert.ok(HL.OPACITY > 0 && HL.OPACITY <= 0.5);
  assert.match(HL.svg(FC, COVER, "radar", COL), new RegExp(`<g opacity="${HL.OPACITY}">`));
});

test("projeção cai dentro da imagem e no lugar certo", () => {
  const p = HL.paths(FC, COVER, [0, 0, 382, 496]);
  const [x, y] = p.cheia[0].slice(1).split("L")[0].split(",").map(Number);
  assert.ok(Math.abs(x - ((-51.9 + 52.15) / 0.35) * 382) < 0.2);
  assert.ok(Math.abs(y - ((-29.15 + 29.2) / 0.4) * 496) < 0.2);
});

test("no slide do processamento, a marca vai nos dois painéis de radar", () => {
  const svg = HL.svg(FC, COVER, "slide", COL);
  assert.match(svg, /viewBox="0 0 1800 1056"/);
  const cheia = svg.match(/<path d="([^"]+)"[^>]*data-classe="cheia"/g);
  assert.equal(cheia.length, 2, "um path por painel");
  const xs = cheia.map((s) => Number(s.match(/d="M([\d.]+)/)[1]));
  assert.ok(xs[0] > 145 && xs[0] < 768, "painel esquerdo");
  assert.ok(xs[1] > 1032 && xs[1] < 1655, "painel direito");
});

test("passagem sem cheia nem seca não desenha nada", () => {
  const svg = HL.svg({ features: [] }, COVER, "radar", COL);
  assert.doesNotMatch(svg, /<path/);
});
