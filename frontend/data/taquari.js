/**
 * Vale do Taquari (RS) — dados REAIS do NISAR processados pela equipe
 * (data/taquari/dados.json + public/nisar/*) e dados SIMULADOS de previsão.
 *
 * 🔌 INTEGRAÇÃO NISAR: hoje os arquivos foram gerados uma vez a partir de duas
 * cenas GCOV (banda L, HH) baixadas do ASF DAAC. Num produto real, esse
 * pipeline rodaria a cada nova passagem do satélite (4–8 dias somando as órbitas) e atualizaria
 * dados.json, as imagens de radar e o GeoJSON automaticamente.
 */
import dados from './taquari/dados.json';
import { asset } from '@/lib/asset';

export const NISAR = dados;

// limites da cena (do dados.json, formato Leaflet [[sul, oeste], [norte, leste]])
const [[sul, oeste], [norte, leste]] = dados.limites_leaflet;
export const LIMITES = { sul, oeste, norte, leste };
export const CENTRO = { lon: (oeste + leste) / 2, lat: (sul + norte) / 2 };

export const ARQUIVOS = {
  ilustrado: asset('/nisar/ilustrado.webp'),               // mapa interpretado a partir do radar (antes)
  ilustradoDepois: asset('/nisar/ilustrado_depois.webp'),  // idem + água nova
  radarAntes: asset('/nisar/radar_antes.webp'),
  radarDepois: asset('/nisar/radar_depois.webp'),
  geojson: asset('/nisar/area_alagada.geojson'),
};

/**
 * Linha do tempo: 2 cenas NISAR reais + 2 passos de previsão (simulados).
 * expansaoKm: quanto a mancha cresce em relação à cena de 23/07 (só previsão).
 */
export const CENAS = [
  { data: dados.data_antes, tipo: 'observado', rotulo: 'Cena NISAR · antes', radar: 'antes', expansaoKm: null },
  { data: dados.data_depois, tipo: 'observado', rotulo: 'Cena NISAR · depois', radar: 'depois', expansaoKm: 0 },
  { data: '2026-07-29', tipo: 'previsto', rotulo: 'Previsão +6 dias', radar: 'depois', expansaoKm: 0.25 },
  { data: '2026-08-04', tipo: 'previsto', rotulo: 'Previsão +12 dias', radar: 'depois', expansaoKm: 0.45 },
];
export const INDICE_CENA_ATUAL = 1;

/**
 * Previsão (SIMULADA).
 * 🔌 INTEGRAÇÃO MODELO: substituir pela saída do modelo de previsão
 * (série de máscaras NISAR + chuva prevista + cota do rio Taquari).
 */
export const PREVISAO = {
  probabilidade: 0.64,
  intervalo: [0.53, 0.74],
  horizonteHoras: 72,
  nivel: 'moderado',
  areaPorCena: [0, dados.area_alagada_km2, 5.9, 7.1], // km² de área alagada nova em cada passo
  fatores: [
    'Mancha nova de 4,2 km² entre 11/07 e 23/07, concentrada nas margens do Taquari',
    'Chuva prevista acima da média na serra nos próximos dias',
    'Trechos baixos de Lajeado, Estrela e Encantado já com água fora do leito',
  ],
};

/**
 * Localidades da busca (sedes municipais).
 * 🔌 INTEGRAÇÃO: trocar por geocodificação (API de localidades do IBGE).
 */
export const LOCALIDADES = [
  ['Lajeado', -51.961, -29.467], ['Estrela', -51.965, -29.502], ['Arroio do Meio', -51.945, -29.401],
  ['Encantado', -51.870, -29.236], ['Cruzeiro do Sul', -51.985, -29.513], ['Colinas', -51.855, -29.395],
  ['Roca Sales', -51.866, -29.284], ['Muçum', -51.871, -29.165], ['Marques de Souza', -52.097, -29.331],
  ['Forquetinha', -52.098, -29.382], ['Santa Clara do Sul', -52.084, -29.475], ['Travesseiro', -52.053, -29.297],
  ['Capitão', -51.986, -29.267], ['Teutônia', -51.806, -29.448], ['Imigrante', -51.775, -29.351],
  ['Bom Retiro do Sul', -51.944, -29.607], ['Venâncio Aires', -52.193, -29.606], ['Santa Tereza', -51.735, -29.165],
  ['Taquari', -51.864, -29.799], ['Porto Alegre', -51.23, -30.03],
].map(([nome, lon, lat]) => ({ nome, uf: 'RS', lon, lat }));

export const LIMITACOES = [
  'Apenas duas cenas (11/07 e 23/07): o pico da cheia pode ter ocorrido entre as passagens.',
  'Áreas urbanas densas geram dupla reflexão e podem esconder água entre prédios.',
  'Água rasa com vento ou vegetação alta pode não ser detectada como água aberta.',
  'Área por município aproximada pela sede mais próxima (sem a malha do IBGE).',
  'A previsão é simulada nesta demonstração e não substitui alertas da Defesa Civil.',
];
