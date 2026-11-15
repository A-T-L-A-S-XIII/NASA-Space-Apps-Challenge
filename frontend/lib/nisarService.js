/**
 * ============================================================================
 *  CAMADA DE DADOS — único ponto que os componentes usam para obter dados.
 * ============================================================================
 *  Vale do Taquari: cenas NISAR REAIS (processadas pela equipe) + previsão SIMULADA.
 *
 *  Cada função pede primeiro à API (lib/api.js) e, se ela falhar, volta para os
 *  arquivos locais em data/taquari (plano B), com um aviso no console. O formato
 *  entregue às páginas é o mesmo nos dois casos; a diferença fica em `origem`:
 *  "nisar" ou "demo" (o `source` da API) ou "local" (plano B).
 *
 *  🔌 INTEGRAÇÃO (ainda locais):
 *   1. obterPrevisao()      → API do modelo de previsão (hoje simulada)
 *   2. buscarLocalidade()   → geocodificação IBGE (hoje 20 sedes fixas)
 *   3. CENAS / LIMITACOES   → linha do tempo e limitações vindas do pipeline
 * ============================================================================
 */
import { NISAR, CENAS, INDICE_CENA_ATUAL, PREVISAO, LIMITES, CENTRO, ARQUIVOS, LIMITACOES } from '@/data/taquari';
import { carregarAlagamento, prepararAlagamento, buscarLocalidades, areaPorMunicipio } from './taquari';
import { api } from './api';

export const REGIAO_ID = 'vale-do-taquari';

/** Tenta a API; se falhar, avisa no console e usa os dados locais. */
async function comPlanoB(nome, tentarApi, local) {
  try {
    return await tentarApi();
  } catch (e) {
    console.warn(`[nisarService] ${nome}: API indisponível (${e?.message ?? e}), usando dados locais`);
    return local();
  }
}

/** [[sul, oeste], [norte, leste]] → limites e centro no formato das telas. */
function limitesDe([[sul, oeste], [norte, leste]]) {
  return { limites: { sul, oeste, norte, leste }, centro: { lon: (oeste + leste) / 2, lat: (sul + norte) / 2 } };
}

/** Só os campos que o dados.json tem (a API acrescenta region_id, source, note e poligonos). */
const comoDadosJson = (r) => Object.fromEntries(Object.keys(NISAR).map((k) => [k, r[k]]));

const eventoLocal = { nisar: NISAR, limites: LIMITES, centro: CENTRO };
const extrasLocais = { cenas: CENAS, indiceAtual: INDICE_CENA_ATUAL, arquivos: ARQUIVOS, limitacoes: LIMITACOES };

let cacheEvento = null;
export function obterEvento() {
  cacheEvento ??= comPlanoB('obterEvento',
    async () => {
      const r = await api.event(REGIAO_ID);
      return { nisar: comoDadosJson(r), ...limitesDe(r.limites_leaflet), origem: r.source };
    },
    () => ({ ...eventoLocal, origem: 'local' }),
  ).then((e) => ({ nisar: e.nisar, cenas: CENAS, indiceAtual: INDICE_CENA_ATUAL, limites: e.limites, centro: e.centro,
    arquivos: ARQUIVOS, limitacoes: LIMITACOES, origem: e.origem }));
  return cacheEvento;
}

/**
 * A API devolve a mancha unida numa feature (MultiPolygon); as telas trabalham polígono a polígono,
 * com `classe`, como no area_alagada.json. Separa cada polígono numa feature própria.
 */
function separarPoligonos(colecao) {
  const features = colecao.features.flatMap((f) => {
    const { type, coordinates } = f.geometry;
    const poligonos = type === 'MultiPolygon' ? coordinates : type === 'Polygon' ? [coordinates] : [];
    return poligonos.map((p) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: p }, properties: { classe: 'alagado' } }));
  });
  return { type: 'FeatureCollection', features };
}

let cacheAlagamento = null;
export function obterAlagamento() {
  cacheAlagamento ??= comPlanoB('obterAlagamento',
    async () => {
      const { nisar } = await obterEvento();
      const r = await api.waterMask(REGIAO_ID, nisar.data_depois);
      const geo = prepararAlagamento(separarPoligonos(r));
      geo.origem = r.source;
      return geo;
    },
    async () => Object.assign(await carregarAlagamento(), { origem: 'local' }),
  );
  return cacheAlagamento;
}

export async function obterPrevisao() {
  // 🔌 INTEGRAÇÃO MODELO DE PREVISÃO: hoje simulada.
  return { ...PREVISAO, origem: 'demo' };
}

export async function buscarLocalidade(texto) {
  return buscarLocalidades(texto, await obterAlagamento());
}

/**
 * Área alagada por município. O /compare só traz os nomes das cidades atingidas, sem área,
 * então o cálculo continua aqui, sobre a mancha que veio da API (ou do plano B).
 */
export async function obterAreaPorMunicipio() {
  const geo = await obterAlagamento();
  return Object.assign(areaPorMunicipio(geo), { origem: geo.origem });
}

/** Catálogo das 19 passagens reais (jun–out 2026). */
let cachePassagens = null;
export function obterPassagens() {
  cachePassagens ??= comPlanoB('obterPassagens',
    async () => {
      const { passagens, puladas, limites, source } = await api.passes(REGIAO_ID);
      return { passagens, puladas, limites, origem: source };
    },
    async () => ({ ...(await import('@/data/taquari/passagens.json')).default, origem: 'local' }),
  );
  return cachePassagens;
}

export const URL_GEOJSON = ARQUIVOS.geojson;
/** Limites da cena e imagens estáticas (public/nisar/), usados de forma síncrona pelo RecorteIlustrado. */
export { LIMITES, ARQUIVOS };
