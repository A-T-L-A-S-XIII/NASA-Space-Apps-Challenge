// Movimento adaptável: prefers-reduced-motion, Save-Data, aparelho fraco,
// e animações CSS restritas a transform/opacity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadModes, read } from "./helpers.mjs";

test("sem preferência do sistema, o movimento é completo", () => {
  const { WW } = loadModes();
  assert.equal(WW.motion.level(), "full");
  assert.equal(WW.reducedMotion(), false);
});

test("prefers-reduced-motion: reduce desliga o movimento extra", () => {
  const { WW } = loadModes({ reduce: true });
  assert.equal(WW.motion.level(), "reduced");
  assert.equal(WW.motion.full(), false);
  assert.equal(WW.reducedMotion(), true);
});

test("Save-Data ou pouca memória também reduzem o movimento", () => {
  assert.equal(loadModes({ saveData: true }).WW.motion.level(), "reduced");
  assert.equal(loadModes({ deviceMemory: 2 }).WW.motion.level(), "reduced");
  assert.equal(loadModes({ deviceMemory: 4 }).WW.motion.level(), "full");
});

const cssDir = fileURLToPath(new URL("../css/", import.meta.url));
const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));

test("toda @keyframes anima só transform e opacity (sem repaint/layout)", () => {
  const permitidas = new Set(["transform", "opacity"]);
  for (const file of cssFiles) {
    const css = read(`../css/${file}`);
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
      const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]);
      for (const p of props) assert.ok(permitidas.has(p), `${file} @keyframes ${m[1]} usa "${p}"`);
    }
  }
});

test("há regra global de prefers-reduced-motion e uma específica no login", () => {
  const comp = read("../css/components.css");
  assert.match(comp, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation-duration: 1ms !important/);
  const login = read("../css/login.css");
  assert.match(login, /@media \(prefers-reduced-motion: reduce\)/);
});

test("login: nada é animado por filtro/SVG a cada quadro; o cursor só move a cena com movimento completo", () => {
  const css = read("../css/login.css");
  const lift = css.match(/\.lift \{[\s\S]*?\}/)[0];
  assert.doesNotMatch(lift, /filter:/, ".lift não usa filter");
  const pit = css.match(/\.pit \{[\s\S]*?\}/)[0];
  assert.doesNotMatch(pit, /var\(--w[^)]*\)\s*\*\s*\d+px\)\s*;?\s*$/m, "blur da sombra é fixo");
  const js = read("../js/login.js");
  assert.doesNotMatch(js, /strokeDashoffset/, "trilha da gota não é redesenhada por quadro");
  assert.match(js, /if \(!fullMotion \|\| e\.pointerType !== "mouse"\) return;/);
  assert.match(js, /cur = fullMotion \? WW\.lerp\(cur, target, 0\.085\) : target;/);
});

test("globo: loop contínuo só com movimento completo e pausa com a aba oculta", () => {
  const js = read("../js/globe.js");
  assert.match(js, /_animated = function \(\) \{\s*return WW\.motion\.full\(\)/);
  assert.match(js, /document\.hidden \|\| !this\._animated\(\)/);
});
