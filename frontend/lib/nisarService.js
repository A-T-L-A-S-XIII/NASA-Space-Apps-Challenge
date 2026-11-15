/**
 * ============================================================================
 *  CAMADA DE DADOS — único ponto que os componentes usam para obter dados.
 * ============================================================================
 *  Vale do Taquari: cenas NISAR REAIS (processadas pela equipe) + previsão SIMULADA.
 *
 *  🔌 PONTOS DE INTEGRAÇÃO FUTURA (procure por "INTEGRAÇÃO NISAR"):
 *   1. obterEvento()        → resultado do pipeline a cada nova passagem (4–8 dias somando as duas órbitas)
 *   2. obterAlagamento()    → GeoJSON da máscara de água mais recente
 *   3. obterPrevisao()      → API do modelo de previsão
 *   4. buscarLocalidade()   → geocodificação IBGE + cruzamento com a máscara
 * ============================================================================
 */
import { NISAR, CENAS, INDICE_CENA_ATUAL, PREVISAO, LIMITES, CENTRO, ARQUIVOS, LIMITACOES } from '@/data/taquari';
import { carregarAlagamento, buscarLocalidades, areaPorMunicipio } from './taquari';

export async function obterEvento() {
  // 🔌 INTEGRAÇÃO NISAR: const r = await fetch(`${API_BASE}/eventos/taquari`); return r.json();
  return { nisar: NISAR, cenas: CENAS, indiceAtual: INDICE_CENA_ATUAL, limites: LIMITES, centro: CENTRO, arquivos: ARQUIVOS, limitacoes: LIMITACOES };
}
export async function obterAlagamento() {
  // 🔌 INTEGRAÇÃO NISAR: GeoJSON exportado pelo pipeline (hoje: arquivo local real).
  return carregarAlagamento();
}
export async function obterPrevisao() {
  // 🔌 INTEGRAÇÃO MODELO DE PREVISÃO: hoje simulada.
  return PREVISAO;
}
export async function buscarLocalidade(texto) {
  return buscarLocalidades(texto, await carregarAlagamento());
}
export async function obterAreaPorMunicipio() {
  // 🔌 INTEGRAÇÃO NISAR: trocar a aproximação por overlay com a malha municipal do IBGE.
  return areaPorMunicipio(await carregarAlagamento());
}

/** Catálogo das 19 passagens reais (jun–out 2026). 🔌 INTEGRAÇÃO: GET /api/passagens?regiao=taquari */
export async function obterPassagens() {
  return (await import('@/data/taquari/passagens.json')).default;
}

export const URL_GEOJSON = ARQUIVOS.geojson;
