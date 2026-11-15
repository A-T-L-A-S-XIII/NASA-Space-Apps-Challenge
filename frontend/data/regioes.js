/**
 * Regiões monitoradas. Só as com status "disponivel" têm cenas NISAR processadas nesta demonstração.
 *
 * 🔌 INTEGRAÇÃO NISAR: esta lista viria do backend — uma entrada por área de interesse, com o
 * status do pipeline (cenas baixadas, processadas, data da última passagem).
 */
export const REGIOES = [
  { id: 'vale-do-taquari', nome: 'Vale do Taquari', local: 'Lajeado, Estrela e Encantado · RS', lon: -51.975, lat: -29.35, status: 'disponivel', detalhe: '19 passagens · jun–out 2026' },
  { id: 'jacui', nome: 'Delta do Jacuí', local: 'Porto Alegre · RS', lon: -51.23, lat: -30.03, status: 'sem-dados' },
  { id: 'itajai', nome: 'Vale do Itajaí', local: 'Blumenau · SC', lon: -49.07, lat: -26.92, status: 'sem-dados' },
  { id: 'doce', nome: 'Bacia do Rio Doce', local: 'Governador Valadares · MG', lon: -41.95, lat: -18.85, status: 'sem-dados' },
  { id: 'baixada', nome: 'Baixada Fluminense', local: 'Duque de Caxias · RJ', lon: -43.31, lat: -22.79, status: 'sem-dados' },
  { id: 'pantanal', nome: 'Pantanal', local: 'Corumbá · MS', lon: -57.65, lat: -19.01, status: 'sem-dados' },
  { id: 'negro', nome: 'Rio Negro', local: 'Manaus · AM', lon: -60.02, lat: -3.12, status: 'sem-dados' },
  { id: 'capibaribe', nome: 'Rio Capibaribe', local: 'Recife · PE', lon: -34.88, lat: -8.05, status: 'sem-dados' },
];
