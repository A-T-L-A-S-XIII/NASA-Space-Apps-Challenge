// Compares frontend/lib/exposure.ts with the Python answers in
// public/api/exposure-samples.json. Run after backend/export_static.py:
//   node scripts/check-exposure.ts
import { readFileSync } from "node:fs";
import { ExposureModel } from "../lib/exposure.ts";

const api = new URL("../public/api/", import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, api), "utf-8"));

const model = new ExposureModel(read("grid.json"), read("timeline.json"), read("access.json"));
const samples = read("exposure-samples.json");
let bad = 0;
for (const py of samples) {
  const ts = model.compute(py.lat, py.lon);
  const pick = (e: any) => ({
    state: e.latest?.state, k: e.history?.k, n: e.history?.n,
    d: e.nearest_candidate_water?.distance_m, access: e.access?.status,
  });
  const a = JSON.stringify(pick(py)), b = JSON.stringify(pick(ts));
  if (a !== b) { bad++; console.error(`MISMATCH at ${py.lat},${py.lon}\n  py ${a}\n  ts ${b}`); }
}
console.log(bad ? `${bad} mismatches` : `exposure parity OK (${samples.length} points)`);
process.exit(bad ? 1 : 0);
