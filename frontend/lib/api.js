/**
 * ============================================================================
 *  CLIENTE DA API Water Waltz — único arquivo do frontend que faz fetch.
 * ============================================================================
 *  Convertido de backend/frontend-api.ts (os tipos viraram JSDoc). Os
 *  componentes não usam este arquivo direto: tudo passa por lib/nisarService.js.
 *
 *  URL base: NEXT_PUBLIC_API_URL em frontend/.env.local (padrão http://localhost:8000).
 *  Datas: as rotas de água aceitam "AAAA-MM" (mês) ou "AAAA-MM-DD" (dia de uma passagem NISAR).
 *  Dados com `source: "demo"` são ilustrativos: mostre sempre o selo e o `note`.
 * ============================================================================
 */

// ------------------------------------------------------------------ comuns
/** @typedef {"seca" | "normal" | "alerta" | "enchente"} StatusAgua */
/** @typedef {"El Niño" | "La Niña" | "Neutro"} FaseEnso */
/** @typedef {[number, number, number, number]} BBox [lon_min, lat_min, lon_max, lat_max] */
/** @typedef {"demo" | "nisar" | string} DataSource "demo" para dado ilustrativo; "nisar" quando vier do NisarProvider */
/** @typedef {{ type: string, coordinates: any }} GeoJSONGeometry */
/** @typedef {[[number, number], [number, number]]} LimitesLeaflet [[sul, oeste], [norte, leste]] */

// ------------------------------------------------------------------ regiões
/**
 * @typedef {object} City
 * @property {string} id Nome sem acento, com hífen (ex.: "roca-sales")
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 */
/**
 * @typedef {object} River
 * @property {string} name
 * @property {[number, number][]} coordinates Pontos [lon, lat], de norte a sul
 */
/**
 * @typedef {object} Region
 * @property {string} id
 * @property {string} name
 * @property {string} state
 * @property {BBox} bbox
 * @property {[number, number]} center [lat, lon] (formato do Leaflet)
 * @property {number} zoom
 * @property {City[]} cities
 * @property {River} river
 */
/**
 * @typedef {object} Scene
 * @property {string} granule
 * @property {string | null} start_time
 * @property {string | null} product
 * @property {string | null} flight_direction
 * @property {string | null} data_maturity
 * @property {string | null} url
 * @property {string | null} browse
 * @property {number | null} size_mb
 * @property {GeoJSONGeometry | null} geometry
 */
/**
 * @typedef {object} ScenesResponse
 * @property {string} region_id
 * @property {boolean} live false quando o ASF não respondeu
 * @property {number} count
 * @property {Record<string, string | number>} query
 * @property {Scene[]} scenes Da mais recente para a mais antiga
 * @property {string | null} error
 * @property {string | null} snapshot_date Data do snapshot usado quando a fonte ao vivo falhou (ou OFFLINE_MODE)
 */

// --------------------------------------------------------------------- água
/**
 * @typedef {object} TimelinePoint
 * @property {string} date AAAA-MM (série mensal) ou AAAA-MM-DD (série por passagem)
 * @property {number} water_area_km2
 * @property {number} anomaly_pct
 * @property {StatusAgua} status
 * @property {number | null} oni
 * @property {FaseEnso | null} enso_phase
 * @property {string | null} event
 * @property {DataSource} source
 * @property {string} [track] Trilha NISAR. Só na série por dia; só compare pontos da mesma trilha
 */
/**
 * @typedef {object} RegionTimeline
 * @property {string} region_id
 * @property {DataSource} source
 * @property {string | null} note
 * @property {string} start
 * @property {string} end
 * @property {number | null} baseline_km2 null na série por dia: cada trilha compara com a própria mediana
 * @property {{ live: boolean, source: string, error: string | null }} enso
 * @property {TimelinePoint[]} series
 */
/**
 * @typedef {object} WaterMaskProperties
 * @property {string} date
 * @property {number} water_area_km2
 * @property {number} anomaly_pct
 * @property {StatusAgua} status
 * @property {string | null} event
 * @property {DataSource} source
 * @property {string[]} cidades_atingidas
 * @property {string | null} note
 */
/**
 * GeoJSON FeatureCollection: pode ir direto para o mapa (Leaflet/MapLibre).
 * @typedef {object} WaterMaskCollection
 * @property {"FeatureCollection"} type
 * @property {string} region_id
 * @property {string} date
 * @property {DataSource} source
 * @property {string | null} note
 * @property {{ type: "Feature", geometry: GeoJSONGeometry, properties: WaterMaskProperties }[]} features
 */
/**
 * @typedef {object} CompareSide
 * @property {string} date
 * @property {number} water_area_km2
 * @property {StatusAgua} status
 * @property {string[]} cidades_atingidas
 * @property {WaterMaskCollection} geojson
 * @property {string | null} browse_url Imagem da cena NISAR mais perto do mês (até 30 dias); null se não houver
 * @property {string | null} browse_date
 */
/**
 * @typedef {object} WaterFrames
 * @property {string} region_id
 * @property {DataSource} source
 * @property {string | null} note
 * @property {string} start
 * @property {string} end
 * @property {number} count
 * @property {{ date: string, status: StatusAgua, water_area_km2: number, source: DataSource, geojson: GeoJSONGeometry }[]} frames
 */
/**
 * @typedef {object} Compare
 * @property {string} region_id
 * @property {DataSource} source
 * @property {string | null} note
 * @property {CompareSide} before
 * @property {CompareSide} after
 * @property {number} delta_km2
 * @property {number | null} delta_pct
 * @property {string[]} cidades_atingidas Cidades atingidas no mês de depois
 * @property {string} summary Frase para o cidadão leigo
 */

// ------------------------------------------------- evento NISAR (equipe)
// Campos em português: os mesmos de frontend/data/taquari/dados.json e passagens.json.
/**
 * @typedef {object} NisarEvent
 * @property {string} region_id
 * @property {"nisar"} source
 * @property {string} note
 * @property {string} evento
 * @property {string} local
 * @property {string} satelite
 * @property {string} produto
 * @property {string} data_antes Cena de antes (AAAA-MM-DD)
 * @property {string} data_depois Cena de depois (AAAA-MM-DD)
 * @property {number} agua_antes_km2
 * @property {number} agua_depois_km2
 * @property {number} area_alagada_km2 Água NOVA entre as cenas: a mancha de waterMask(id, data_depois)
 * @property {number} poligonos
 * @property {LimitesLeaflet} limites_leaflet
 * @property {{ antes: string, depois: string, alagado: string, vetor: string }} arquivos Nomes das imagens em frontend/public/nisar/
 * @property {string} fonte
 */
/**
 * @typedef {object} NisarPass
 * @property {number} n
 * @property {string} data AAAA-MM-DD
 * @property {string} trilha Ex.: "103_A_163". Só compare passagens da mesma trilha
 * @property {"ascendente" | "descendente"} orbita
 * @property {number} agua_km2
 * @property {number} cheia_km2 Água acima do normal da época
 * @property {number} seca_km2 Água abaixo do normal da época
 * @property {boolean} na_janela_da_enchente
 * @property {string} granulo
 * @property {string} img Quadro em frontend/public/nisar/passagens/
 */
/**
 * @typedef {object} NisarPasses
 * @property {string} region_id
 * @property {"nisar"} source
 * @property {string} note
 * @property {number} count
 * @property {NisarPass[]} passagens
 * @property {{ data: string, motivo: string }[]} puladas
 * @property {LimitesLeaflet} limites
 */

// -------------------------------------------------------------------- clima
/**
 * @typedef {object} OniPoint
 * @property {string} season Estação de 3 meses, ex.: "DJF"
 * @property {number} year
 * @property {string} month Mês central da estação (AAAA-MM)
 * @property {number} total
 * @property {number} oni
 * @property {FaseEnso} phase
 */
/**
 * @typedef {object} Enso
 * @property {boolean} live
 * @property {string} source
 * @property {string} url
 * @property {string | null} fetched_at
 * @property {OniPoint | null} latest
 * @property {number} count
 * @property {OniPoint[]} series
 * @property {string | null} error
 * @property {string | null} snapshot_date
 */

// -------------------------------------------------------------- explicações
/** @typedef {"sar" | "agua-no-radar" | "nisar" | "el-nino" | "la-nina" | "como-ler-o-mapa"} ExplainTopicId */
/**
 * @typedef {object} ExplainTopic
 * @property {ExplainTopicId} id
 * @property {string} title
 * @property {string} summary
 * @property {string} body Parágrafos separados por linha em branco: body.split("\n\n")
 * @property {string} icon
 * @property {{ label: string, color: string, pattern: "solid" | "hatch", meaning: string }[] | null} legend Só no tópico "como-ler-o-mapa"
 */

// ---------------------------------------------------------- status (card)
/**
 * @typedef {object} RegionStatus
 * @property {string} region_id
 * @property {string} region_name
 * @property {{ date: string, water_area_km2: number, anomaly_pct: number, status: StatusAgua, event: string | null, source: DataSource, note: string | null }} water
 * @property {{ live: boolean, month: string | null, season: string | null, oni: number | null, phase: FaseEnso | null, error: string | null, snapshot_date: string | null }} enso
 * @property {{ live: boolean, scene: Scene | null, error: string | null, snapshot_date: string | null }} latest_scene
 * @property {string} text Resumo curto para o card principal
 */

// -------------------------------------------------------------- autenticação
/** @typedef {"cidadao" | "governo"} Role */
/**
 * @typedef {object} User
 * @property {number} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {string | null} city
 * @property {string} created_at
 */
/** @typedef {{ name: string, email: string, password: string, city?: string | null }} UserCreate */
/** @typedef {{ access_token: string, token_type: "bearer", user: User }} TokenResponse */

// ------------------------------------------------------------------- alertas
/** @typedef {"atencao" | "alerta" | "emergencia"} NivelAlerta */
/**
 * @typedef {object} Alert
 * @property {number} id
 * @property {string} region_id
 * @property {string | null} city_id null = alerta para a região inteira
 * @property {NivelAlerta} level
 * @property {string} title
 * @property {string} message
 * @property {number} created_by
 * @property {string} created_at
 * @property {boolean} active
 * @property {"governo" | "demo"} source "demo" = alerta de exemplo criado no startup, não é aviso real
 */
/** @typedef {{ region_id: string, city_id?: string | null, level: NivelAlerta, title: string, message: string }} AlertCreate */
/**
 * @typedef {object} CityStatus
 * @property {string} city_id
 * @property {string} city_name
 * @property {string} region_id
 * @property {string} date
 * @property {boolean} inside_water A mancha d'água do mês cobre o núcleo urbano da cidade
 * @property {StatusAgua} status
 * @property {number} water_area_km2
 * @property {DataSource} source
 * @property {string | null} note
 * @property {string} text
 * @property {Alert[]} alerts
 */

// --------------------------------------------------------------------- erros
/** Erro da API. `detail` vem em português, pronto para mostrar ao usuário. */
export class ApiError extends Error {
  /**
   * @param {number} status 0 quando não houve resposta (rede ou timeout)
   * @param {string} detail
   * @param {unknown} body
   */
  constructor(status, detail, body) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

// -------------------------------------------------------------------- client
export const TIMEOUT_MS = 6000;

/** URL da API. O try cobre a versão estática (estatico/), onde `process` não existe. */
function urlPadrao() {
  try { return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'; } catch { return 'http://localhost:8000'; }
}

/**
 * @param {string} [baseUrl]
 * @param {() => string | null} [getToken]
 */
export function createApi(baseUrl = urlPadrao(), getToken) {
  const base = baseUrl.replace(/\/$/, '');

  /** fetch com timeout; erros de rede e de tempo viram ApiError com status 0. */
  async function buscar(url, init = {}) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controle.signal });
    } catch (e) {
      const detail = e?.name === 'AbortError'
        ? `A API não respondeu em ${TIMEOUT_MS / 1000} s (${url})`
        : `Não foi possível conectar à API (${url})`;
      throw new ApiError(0, detail, null);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @template T
   * @param {string} path
   * @param {RequestInit & { query?: Record<string, string | number | undefined | null> }} [init]
   * @returns {Promise<T>}
   */
  async function request(path, init = {}) {
    const { query, headers, ...rest } = init;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    const token = getToken?.();

    const res = await buscar(`${base}${path}${qs ? `?${qs}` : ''}`, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = typeof body?.detail === 'string' ? body.detail : `Erro ${res.status} em ${path}`;
      throw new ApiError(res.status, detail, body);
    }
    return body;
  }

  const region = (id) => `/api/regions/${encodeURIComponent(id)}`;

  return {
    /** @returns {Promise<{ status: "ok" }>} */
    health: () => request('/health'),

    // Regiões
    /** @returns {Promise<Region[]>} */
    regions: () => request('/api/regions'),
    /** @returns {Promise<Region>} */
    region: (id) => request(region(id)),
    /** @returns {Promise<RegionStatus>} */
    regionStatus: (id) => request(`${region(id)}/status`),
    /**
     * @param {{ start?: string, end?: string, product?: string, limit?: number }} [opts]
     * @returns {Promise<ScenesResponse>}
     */
    scenes: (id, opts = {}) => request(`${region(id)}/scenes`, { query: opts }),

    // Evento NISAR processado pela equipe
    /** @returns {Promise<NisarEvent>} */
    event: (id) => request(`${region(id)}/event`),
    /** @returns {Promise<NisarPasses>} */
    passes: (id) => request(`${region(id)}/passes`),

    // Água: demo, ou NISAR real nas datas com cena (date/start/end/before/after: AAAA-MM ou AAAA-MM-DD)
    /** @returns {Promise<RegionTimeline>} */
    timeline: (id, opts = {}) => request(`${region(id)}/timeline`, { query: opts }),
    /** @returns {Promise<WaterMaskCollection>} */
    waterMask: (id, date) => request(`${region(id)}/water-mask`, { query: { date } }),
    /** @returns {Promise<WaterFrames>} */
    waterFrames: (id, opts = {}) => request(`${region(id)}/water-mask/frames`, { query: opts }),
    /** @returns {Promise<Compare>} */
    compare: (id, before, after) => request(`${region(id)}/compare`, { query: { before, after } }),

    // Alertas
    /** @returns {Promise<Alert[]>} */
    alerts: (opts = {}) => request('/api/alerts', { query: opts }),
    /** @param {AlertCreate} data @returns {Promise<Alert>} */
    createAlert: (data) => request('/api/alerts', { method: 'POST', body: JSON.stringify(data) }),
    /** @returns {Promise<Alert>} */
    setAlertActive: (alertId, active) =>
      request(`/api/alerts/${alertId}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    /** @returns {Promise<CityStatus>} */
    myCityStatus: () => request('/api/me/city-status'),
    /** CSV da linha do tempo (só governo). Devolve um Blob para baixar. */
    exportTimelineCsv: async (id, opts = {}) => {
      const params = new URLSearchParams(Object.entries(opts).filter(([, v]) => v));
      const token = getToken?.();
      const res = await buscar(`${base}/api/gov/export/${encodeURIComponent(id)}.csv?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, typeof body?.detail === 'string' ? body.detail : `Erro ${res.status}`, body);
      }
      return res.blob();
    },

    // Clima
    /** @returns {Promise<Enso>} */
    enso: (start) => request('/api/climate/enso', { query: { start } }),

    // Explicações
    /** @returns {Promise<ExplainTopic[]>} */
    explain: () => request('/api/explain'),
    /** @param {ExplainTopicId} topic @returns {Promise<ExplainTopic>} */
    explainTopic: (topic) => request(`/api/explain/${topic}`),

    // Autenticação
    /** @param {UserCreate} data @returns {Promise<User>} */
    register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    /** @returns {Promise<TokenResponse>} */
    login: (email, password) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    /** @returns {Promise<User>} */
    me: () => request('/api/auth/me'),
    /** @param {UserCreate} data @returns {Promise<User>} */
    createGovUser: (data) => request('/api/auth/gov-users', { method: 'POST', body: JSON.stringify(data) }),
  };
}

/**
 * Cliente padrão. A sessão do protótipo ainda não tem token.
 * 🔌 INTEGRAÇÃO: trocar o segundo argumento pela leitura do token quando o login usar /api/auth/login.
 */
export const api = createApi(urlPadrao(), () => null);
