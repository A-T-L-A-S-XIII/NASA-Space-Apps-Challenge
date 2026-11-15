// Carrega public/js/modes.js num contexto isolado (vm) com um "navegador" falso.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = readFileSync(fileURLToPath(new URL("../public/js/modes.js", import.meta.url)), "utf8");

export function loadModes({ reduce = false, saveData = false, deviceMemory = 8, stored = {} } = {}) {
  const storage = new Map(Object.entries(stored));
  const events = [];
  const attrs = {};
  const win = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    matchMedia: (q) => ({ matches: reduce && q.includes("prefers-reduced-motion: reduce") }),
    navigator: { connection: { saveData }, deviceMemory },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent: (e) => { events.push(e); return true; },
    addEventListener: () => {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: "modes.js" });
  return { WW: win.WW, storage, events, attrs };
}

export const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
