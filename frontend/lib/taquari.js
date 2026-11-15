/**
 * Análises sobre o GeoJSON real da área alagada (Vale do Taquari).
 *
 * 🔌 INTEGRAÇÃO NISAR: com o pipeline completo, estes cálculos viriam prontos
 * do backend (PostGIS/GeoPandas), inclusive o cruzamento com a malha do IBGE.
 */
import { geoArea, geoCentroid, geoDistance, geoContains } from 'd3-geo';
import { LOCALIDADES, LIMITES } from '@/data/taquari';
import geoBruto from '@/data/taquari/area_alagada.json';

const R_KM = 6371.0088;
const AREA_KM2 = (f) => geoArea(f) * R_KM * R_KM;

let cache = null;
/** GeoJSON real (empacotado junto ao app) com área e centroide de cada polígono pré-calculados. */
export function carregarAlagamento() {
  cache ??= Promise.resolve(prepararAlagamento(structuredClone(geoBruto)));
  return cache;
}
export function prepararAlagamento(geo) {
  // d3-geo exige anéis no sentido horário; corrige polígonos "invertidos"
  for (const f of geo.features) {
    if (geoArea(f) > 2 * Math.PI) f.geometry.coordinates.forEach((anel) => anel.reverse());
    f.properties.area_km2 = AREA_KM2(f);
    f.properties.centroide = geoCentroid(f);
  }
  geo.totalKm2 = geo.features.reduce((s, f) => s + f.properties.area_km2, 0);
  geo.classes = [...new Set(geo.features.map((f) => f.properties.classe))];
  return geo;
}

const dentroDaCena = (lon, lat) => lon >= LIMITES.oeste && lon <= LIMITES.leste && lat >= LIMITES.sul && lat <= LIMITES.norte;
const kmEntre = (a, b) => geoDistance(a, b) * R_KM;

/** Situação de um lugar em relação à mancha real de 23/07. */
export function situacaoDoLugar(lugar, geo) {
  const p = [lugar.lon, lugar.lat];
  if (!dentroDaCena(lugar.lon, lugar.lat)) return { status: 'fora', distanciaKm: null, areaProximaKm2: 0 };
  let dist = Infinity, areaProx = 0;
  for (const f of geo.features) {
    if (geoContains(f, p)) dist = 0;
    // distância aproximada até o polígono = menor distância até seus vértices
    for (const anel of f.geometry.coordinates) for (const v of anel) dist = Math.min(dist, kmEntre(p, v));
    if (kmEntre(p, f.properties.centroide) <= 5) areaProx += f.properties.area_km2;
  }
  const status = dist <= 1.2 ? 'afetada' : dist <= 3 ? 'risco' : 'segura';
  return { status, distanciaKm: dist, areaProximaKm2: areaProx };
}

/** Área alagada por município — aproximação: cada polígono vai para a sede mais próxima. */
export function areaPorMunicipio(geo) {
  const sedes = LOCALIDADES.filter((l) => dentroDaCena(l.lon, l.lat));
  const soma = new Map(sedes.map((s) => [s.nome, { municipio: s.nome, areaKm2: 0, poligonos: 0 }]));
  for (const f of geo.features) {
    let melhor = null, d = Infinity;
    for (const s of sedes) {
      const k = kmEntre([s.lon, s.lat], f.properties.centroide);
      if (k < d) { d = k; melhor = s; }
    }
    const linha = soma.get(melhor.nome);
    linha.areaKm2 += f.properties.area_km2;
    linha.poligonos += 1;
  }
  return [...soma.values()].filter((l) => l.areaKm2 > 0).sort((a, b) => b.areaKm2 - a.areaKm2);
}

export const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Busca local (só municípios da região nesta demo). */
export function buscarLocalidades(texto, geo) {
  const q = normalizar(texto);
  if (q.length < 2) return [];
  return LOCALIDADES.filter((l) => normalizar(l.nome).includes(q))
    .sort((a, b) => normalizar(a.nome).indexOf(q) - normalizar(b.nome).indexOf(q))
    .slice(0, 5)
    .map((l) => ({ ...l, ...situacaoDoLugar(l, geo) }));
}
