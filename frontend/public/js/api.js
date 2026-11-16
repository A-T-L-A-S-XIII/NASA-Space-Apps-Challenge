/* ==========================================================================
   Cliente da API Water Waltz. É o único arquivo com fetch.

   - Só caminhos relativos (/api/...): o Next.js repassa para o FastAPI
     (rewrite em next.config.js, com API_URL lida no servidor).
   - As telas continuam pedindo os caminhos antigos (/api/nisar/*, /api/previsao,
     /api/lugares). Aqui eles viram as rotas do main e os campos voltam com os
     nomes que as telas já usam.
   - Plano B: se a API estiver fora, os dados vêm de data/fallback/ e o console avisa.
   - Sessão: o token fica num cookie httpOnly gravado pelo Next.js (app/api/auth/*);
     este arquivo nunca o vê. Aqui só ficam o nome e a cidade do usuário.
   - Toda resposta traz "origem": "nisar", "demo", "open-meteo" (o "source" da API)
     ou "local" (plano B).
   ========================================================================== */
(function (WW) {
  "use strict";

  const REGIAO = "vale-do-taquari";
  const R = `/api/regions/${REGIAO}`;
  const TIMEOUT_MS = 6000;
  const FALLBACK = "data/fallback/";
  const MES_PADRAO = "2026-07";
  const MESES = ["January", "February", "March", "April", "May", "June", "July",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  // Textos fixos do processamento (a API não tem rota de metadados)
  const LOCAL = "Vale do Taquari (RS) · trecho entre Muçum e Lajeado";
  const TRECHO = "on the stretch of the Taquari river between Muçum and Lajeado";
  const AVISO_TRILHA = "The water area changes with the satellite track: compare only dates from the same track.";
  const CLASSES = { cheia: "water above normal", seca: "less water than normal" };
  const VEGETACAO_ALAGADA = {
    disponivel: false,
    motivo: "The processed scenes have only HH polarisation. Separating flooded vegetation "
      + "needs HV polarisation (or the HH/HV ratio) and new processing.",
    requer: "Reprocess the GCOV scenes with HH+HV and add a flooded-vegetation route to the API.",
  };
  const FONTE_LUGAR = { ibge: "IBGE", osm: "OpenStreetMap (Nominatim)" };
  // Texts the API sends in Portuguese, written here in English from the same sources
  const CUIDADOS = [
    "The water area depends on the track (orbit): compare only dates from the same track.",
    "The processed area runs from Muçum to Lajeado and takes part of Estrela; Bom Retiro do Sul and Taquari are left out.",
    "Candidate water-change indicator from radar — not a validated flood map. Not for evacuation or route decisions.",
  ];
  const METODO_MUNICIPIO = "Each above- or below-normal polygon is added to the municipality that contains its centre (IBGE municipal mesh). The processed area covers only part of each municipality.";
  const EXPLICA = {
    "el-nino": { titulo: "El Niño", resumo: "Warming of the Pacific Ocean waters that, on average, brings more rain to southern Brazil. It is a tendency, not a rule: the app shows El Niño and the water side by side, but does not say that a specific flood was caused by it." },
    "la-nina": { titulo: "La Niña", resumo: "Cooling of the Pacific waters, linked to less rain and to droughts in Rio Grande do Sul. Like El Niño, it is a tendency and does not decide alone what happens in each place." },
  };

  const cache = new Map();   // respostas já convertidas, por caminho pedido pela tela
  const cargas = new Map();  // respostas da API (ou do plano B), por rota
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sem storage */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* sem storage */ } },
  };

  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data; }
  }

  /* ------------------------------------------------------------------ rede */
  async function request(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let r, data;
    try {
      r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      data = await r.json().catch(() => null);
    } catch (e) {
      throw new ApiError(e && e.name === "AbortError" ? `The API did not answer within ${TIMEOUT_MS / 1000} s.`
        : "Could not reach the API.", 0);
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      const detail = data && typeof data.detail === "string" ? data.detail : null;
      // 500/502/504 sem "detail" vêm do Next.js quando o FastAPI não responde
      throw new ApiError(detail || (r.status >= 500 ? `The API is down (error ${r.status}).` : `API error ${r.status}.`), r.status, data);
    }
    if (data === null) throw new ApiError("The API returned a response that is not JSON.", r.status);
    return data;
  }

  const foraDoAr = (e) => !e.status || e.status >= 500;

  /* GET na API. Com ela fora do ar, usa o plano B: um arquivo de data/fallback/ ou uma função.
     Devolve { data, local }. Um 4xx é resposta de verdade e não cai no plano B. */
  function load(path, planoB) {
    if (cargas.has(path)) return cargas.get(path);
    const p = request(path).then((data) => ({ data, local: false }), async (e) => {
      if (!planoB || !foraDoAr(e)) throw e;
      try {
        const data = typeof planoB === "function" ? await planoB() : await request(FALLBACK + planoB);
        console.warn(`[WW.api] ${path} failed: ${e.message} Using the saved local data (fallback).`);
        return { data, local: true };
      } catch (e2) {
        throw e;
      }
    });
    cargas.set(path, p);
    p.catch(() => cargas.delete(path));
    return p;
  }

  const loadPasses = () => load(`${R}/passes`, "passagens.json");
  const loadEvento = () => load(`${R}/export?format=json`, "evento.json");
  const loadMalha = () => load(`${R}/municipalities/geojson`, "municipios-malha.geojson");

  /* ------------------------------------------------------------- conversão */
  const origem = (d, local) => (local ? "local" : (d && d.source) || "api");
  const nomeMes = (ym) => { const [a, m] = ym.split("-"); return `${MESES[+m - 1]} ${a}`; };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dataBR = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; };
  const fmtKm2 = (v) => v.toFixed(1) + " km²";
  const r1 = (v) => Math.round(v * 10) / 10;
  const cobertura = ([oeste, sul, leste, norte]) => ({ oeste, sul, leste, norte });
  // No plano B as imagens também são locais
  const imagem = (u, local) => (u && local ? u.replace("/api/static/nisar/", FALLBACK + "nisar/") : u);

  function passagem(p, d, local) {
    const [oeste, sul, leste, norte] = d.coverage;
    return {
      n: p.n, data: p.date, trilha: p.track, pol: p.polarization, passagens_na_orbita: p.passes_in_track,
      agua_km2: p.water_km2, cheia_km2: p.flood_km2, seca_km2: p.dry_km2,
      na_janela_da_enchente: p.in_flood_window,
      limites_leaflet: [[sul, oeste], [norte, leste]],
      fonte: d.data_source, granulo: p.granule,
      imagens: { radar: imagem(p.images.radar, local), slide: imagem(p.images.slide, local) },
      geojson: `/api/nisar/passagens/${p.n}/geojson`,
    };
  }

  const feicao = (f) => ({
    type: "Feature", geometry: f.geometry,
    properties: { classe: f.properties.class, data: f.properties.date, trilha: f.properties.track, area_km2: f.properties.area_km2 },
  });

  /* ----------------------------------------------------------------- rotas */
  async function regiao() {
    const { data, local } = await load(R, "regiao.json");
    return { ...data, origem: origem(data, local) };
  }

  async function passagens(mes) {
    const { data: d, local } = await loadPasses();
    return {
      mes: mes || null, meses: d.months, area_coberta: cobertura(d.coverage),
      itens: d.passes.filter((p) => !mes || p.date.startsWith(mes)).map((p) => passagem(p, d, local)),
      origem: origem(d, local),
    };
  }

  async function resumo(mes) {
    const { itens: ps, area_coberta, origem: org } = await passagens(mes);
    const nome = nomeMes(mes);
    if (!ps.length) {
      return { mes, mes_nome: nome, passagens: 0, nivel: "sem_dados",
        frase: `The radar did not pass ${TRECHO} in ${nome}, so there is no way to tell whether it flooded.`,
        cheia_km2: null, seca_km2: null, por_trilha: [], datas: [], origem: org };
    }
    const cheia = r1(ps.reduce((s, p) => s + p.cheia_km2, 0));
    const seca = r1(ps.reduce((s, p) => s + p.seca_km2, 0));
    const pico = ps.reduce((a, p) => (p.cheia_km2 > a.cheia_km2 ? p : a));
    let nivel, frase;
    if (cheia === 0) {
      nivel = "normal";
      frase = `In ${nome}, the radar passed ${ps.length} times ${TRECHO} and saw no water above normal. The river stayed in its usual bed.`;
    } else if (cheia < 1) {
      nivel = "normal";
      frase = `In ${nome}, the radar passed ${ps.length} times ${TRECHO} and saw almost no water above normal: ${fmtKm2(cheia)} in the month, most of it on ${dataBR(pico.data)}. Nothing like a flood.`;
    } else if (cheia < 5) {
      nivel = "atencao";
      frase = `In ${nome}, the radar saw ${fmtKm2(cheia)} of water above normal ${TRECHO}, mostly on ${dataBR(pico.data)}. It is little, but worth watching.`;
    } else {
      nivel = "alagamento";
      frase = `In ${nome}, the radar saw ${fmtKm2(cheia)} of water above normal ${TRECHO}. The worst moment was on ${dataBR(pico.data)}.`;
    }
    const por_trilha = [...new Set(ps.map((p) => p.trilha))].sort().map((t) => {
      const v = ps.filter((p) => p.trilha === t).map((p) => p.agua_km2);
      return { trilha: t, passagens: v.length, agua_min_km2: Math.min(...v), agua_max_km2: Math.max(...v) };
    });
    return {
      mes, mes_nome: nome, passagens: ps.length, nivel, frase, cheia_km2: cheia, seca_km2: seca,
      pico: cheia ? { data: pico.data, cheia_km2: pico.cheia_km2 } : null,
      na_janela_da_enchente: ps.some((p) => p.na_janela_da_enchente),
      por_trilha, datas: ps.map((p) => p.data), area_coberta, aviso: AVISO_TRILHA, origem: org,
    };
  }

  async function metadados() {
    const [{ itens: ps, area_coberta, origem: org }, ev, malha] = await Promise.all([
      passagens(null), loadEvento(), loadMalha().catch(() => null)]);
    const prov = ev.data.provenance;
    const [, banda] = prov.product.split(", banda ");
    const produto = "L2 GCOV (geocoded backscatter)";
    const trilhas = [];
    for (const p of ps) {
      let t = trilhas.find((x) => x.trilha === p.trilha);
      if (!t) trilhas.push(t = { trilha: p.trilha, passagens: 0, datas: [] });
      t.passagens += 1;
      t.datas.push(p.data);
    }
    const janela = ps.filter((p) => p.na_janela_da_enchente).map((p) => p.data);
    return {
      satelite: prov.satellite, produto, banda: banda || "L",
      polarizacao: [...new Set(ps.map((p) => p.pol))].sort(),
      fonte: prov.data_source, local: LOCAL, area_coberta,
      periodo: { inicio: ps[0].data, fim: ps[ps.length - 1].data, passagens: ps.length },
      janela_da_enchente: janela.length ? { inicio: janela[0], fim: janela[janela.length - 1],
        origem: "processing catalogue (source of the window still open)" } : null,
      trilhas, classes: CLASSES, cuidados: CUIDADOS, vegetacao_alagada: VEGETACAO_ALAGADA,
      granulos: ps.map((p) => ({ n: p.n, data: p.data, trilha: p.trilha, granulo: p.granulo })),
      municipios_fonte: malha ? malha.data.attribution : null,
      origem: ev.local ? "local" : org,
    };
  }

  async function geojsonPassagem(n) {
    // Plano B: um arquivo só, com os polígonos de todas as passagens
    const { data, local } = await load(`${R}/passes/${n}/geojson`, "cheia-seca.geojson");
    const feats = local ? data.features.filter((f) => f.properties.n === n) : data.features;
    return { type: "FeatureCollection", features: feats.map(feicao), origem: origem(data, local) };
  }

  async function geojsonMes(mes) {
    const { data, local } = await load(`${R}/export?format=geojson&month=${mes}`, "cheia-seca.geojson");
    const feats = local ? data.features.filter((f) => f.properties.date.startsWith(mes)) : data.features;
    return { type: "FeatureCollection", mes, fonte: data.provenance.data_source, aviso: CUIDADOS[CUIDADOS.length - 1],
      features: feats.map(feicao), origem: origem(data, local) };
  }

  async function malhaMunicipal() {
    const { data, local } = await loadMalha();
    return { type: "FeatureCollection", source: data.attribution, features: data.features, origem: origem(data, local) };
  }

  async function municipios(mes) {
    const { data: d, local } = await load(`${R}/municipalities?month=${mes}`, `municipios-${mes}.json`);
    return {
      mes: d.month, mes_nome: nomeMes(d.month), datas: d.dates, metodo: METODO_MUNICIPIO,
      fora_dos_municipios: { cheia_km2: d.outside_municipalities.flood_km2, seca_km2: d.outside_municipalities.dry_km2 },
      municipios: d.municipalities.map((m) => ({
        id: m.id, nome: m.name, toca_area_coberta: m.touches_coverage, cheia_km2: m.flood_km2, seca_km2: m.dry_km2,
        por_data: m.per_date.map((x) => ({ data: x.date, cheia_km2: x.flood_km2, seca_km2: x.dry_km2 })),
      })),
      origem: origem(d, local),
    };
  }

  /* A Open-Meteo limita pedidos por IP, e o IP de saída do Render é compartilhado (429). Se a API vier sem
     dias, o navegador consulta a Open-Meteo direto, com os mesmos parâmetros e a mesma frase do backend
     (services/forecast.py). Continua sendo previsão ao vivo, nunca uma cópia antiga. */
  const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
  const CENTRO = [-29.42, -51.93]; // center da região no backend, usado só se a API nem responder

  function frasePrevisao(days) {
    if (!days.length) return "No forecast for the next days.";
    const total = days.reduce((s, x) => s + (x.rain_mm || 0), 0);
    if (total < 5) return `Little or no rain forecast for the next ${days.length} days.`;
    const pico = days.reduce((a, x) => ((x.rain_mm || 0) > (a.rain_mm || 0) ? x : a));
    return `${total.toFixed(1)} mm of rain forecast for the next ${days.length} days, heaviest on ${dataBR(pico.date)}.`;
  }

  async function previsaoDireta(base, dias) {
    const lat = base ? base.lat : CENTRO[0], lon = base ? base.lon : CENTRO[1];
    const n = Math.min(16, Math.max(1, parseInt(dias, 10) || 7));
    const q = new URLSearchParams({ latitude: lat, longitude: lon, timezone: "America/Sao_Paulo", forecast_days: n,
      daily: "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let raw;
    try {
      const r = await fetch(`${OPEN_METEO}?${q}`, { headers: { Accept: "application/json" }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`Open-Meteo respondeu ${r.status}`);
      raw = await r.json();
    } finally {
      clearTimeout(timer);
    }
    const dl = (raw && raw.daily) || {};
    const col = (k) => dl[k] || [];
    const days = (dl.time || []).map((date, i) => ({ date, rain_mm: col("precipitation_sum")[i] ?? null,
      rain_probability_pct: col("precipitation_probability_max")[i] ?? null,
      tmin_c: col("temperature_2m_min")[i] ?? null, tmax_c: col("temperature_2m_max")[i] ?? null }));
    if (!days.length) throw new Error("Open-Meteo returned no days");
    console.warn("[WW.api] The API returned no forecast; asking Open-Meteo directly from the browser.");
    return { source: "open-meteo", live: true, kind: "Weather forecast, not a flood forecast.", lat, lon,
      generated_at: new Date().toISOString(), total_rain_mm: r1(days.reduce((s, x) => s + (x.rain_mm || 0), 0)),
      summary: frasePrevisao(days), days, error: null };
  }

  async function previsao(dias) {
    // Sem plano B com arquivo: previsão antiga apresentada como atual enganaria quem lê
    let d = null, falha = null;
    try {
      d = await request(`${R}/forecast${dias ? `?days=${encodeURIComponent(dias)}` : ""}`);
    } catch (e) {
      if (!foraDoAr(e)) throw e;
      falha = e;
    }
    if (!d || !d.days.length) {
      try {
        d = await previsaoDireta(d, dias);
      } catch (e) {
        if (falha) throw falha;
        throw new ApiError(d.error || "Forecast unavailable right now.", 502);
      }
    }
    return {
      fonte: "Open-Meteo (global weather models)", tipo: "Weather forecast, not a flood forecast.", lat: d.lat, lon: d.lon,
      gerado_em: d.generated_at, chuva_total_mm: d.total_rain_mm, frase: frasePrevisao(d.days),
      dias: d.days.map((x) => ({ data: x.date, chuva_mm: x.rain_mm, prob_chuva: x.rain_probability_pct, tmin: x.tmin_c, tmax: x.tmax_c })),
      origem: origem(d, false),
    };
  }

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  /* Plano B da busca: só os municípios, procurados na malha local */
  async function lugaresLocais(q) {
    const [{ data: malha }, { data: ps }] = await Promise.all([loadMalha(), loadPasses()]);
    const [oeste, sul, leste, norte] = ps.coverage;
    const alvo = norm(q);
    const items = malha.features.filter((f) => alvo && norm(f.properties.name).includes(alvo)).map((f) => {
      const g = f.geometry;
      const pts = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flatMap((poly) => poly[0].slice(0, -1));
      const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return { name: f.properties.name, kind: "município", lat: +lat.toFixed(5), lon: +lon.toFixed(5),
        inside_coverage: sul <= lat && lat <= norte && oeste <= lon && lon <= leste, source: "ibge" };
    });
    items.sort((a, b) => (norm(b.name).startsWith(alvo) - norm(a.name).startsWith(alvo)) || a.name.localeCompare(b.name, "pt-BR"));
    return { q, items, error: "Without the API, the search shows only municipalities (no neighbourhoods)." };
  }

  async function lugares(q) {
    const path = `/api/places?q=${encodeURIComponent(q)}&region_id=${REGIAO}`;
    const { data: d, local } = await load(path, () => lugaresLocais(q));
    return {
      q: d.q, erro_bairros: d.error,
      itens: d.items.map((i) => ({ nome: i.name, tipo: i.kind, lat: i.lat, lon: i.lon,
        dentro_da_area_coberta: i.inside_coverage, fonte: FONTE_LUGAR[i.source] || i.source })),
      origem: origem(d, local),
    };
  }

  /* ENSO (El Niño / La Niña): sem plano B. Sem dado, devolve null e o selo não aparece.
     Com a NOAA fora, o backend usa o snapshot salvo (live: false): o dado continua real. */
  let ensoP = null;
  function enso() {
    if (!ensoP) {
      ensoP = request("/api/climate/enso").then((d) => {
        const u = d && d.latest;
        if (!u || typeof u.oni !== "number" || !u.phase) return null;
        return { fase: u.phase, oni: u.oni, estacao: `${u.season} ${u.year}`, mes: u.month,
          live: !!d.live, data_snapshot: d.snapshot_date || null, origem: origem(d, false) };
      }, (e) => {
        console.warn(`[WW.api] ENSO unavailable: ${e.message} The badge stays hidden.`);
        return null;
      });
      ensoP.then((v) => { if (!v) ensoP = null; }); // tenta de novo na próxima tela
    }
    return ensoP;
  }

  /* Texto curto de /api/explain/{topico} (ex.: el-nino, la-nina) */
  const explicacoes = new Map();
  function explicacao(topico) {
    if (!explicacoes.has(topico)) {
      const p = EXPLICA[topico] ? Promise.resolve(EXPLICA[topico])
        : request(`/api/explain/${encodeURIComponent(topico)}`).then((d) => ({ titulo: d.title, resumo: d.summary }));
      explicacoes.set(topico, p);
      p.catch(() => explicacoes.delete(topico));
    }
    return explicacoes.get(topico);
  }

  // Caminho que a tela pede -> função que busca na rota do main e converte
  const ROTAS = [
    [/^\/api\/regions\/vale-do-taquari$/, () => regiao()],
    [/^\/api\/nisar\/passagens$/, (m, q) => passagens(q.get("mes"))],
    [/^\/api\/nisar\/passagens\/(\d+)\/geojson$/, (m) => geojsonPassagem(+m[1])],
    [/^\/api\/nisar\/geojson$/, (m, q) => geojsonMes(q.get("mes") || MES_PADRAO)],
    [/^\/api\/nisar\/resumo$/, (m, q) => resumo(q.get("mes") || MES_PADRAO)],
    [/^\/api\/nisar\/municipios\/geojson$/, () => malhaMunicipal()],
    [/^\/api\/nisar\/municipios$/, (m, q) => municipios(q.get("mes") || MES_PADRAO)],
    [/^\/api\/nisar\/metadados$/, () => metadados()],
    [/^\/api\/previsao$/, (m, q) => previsao(q.get("dias"))],
    [/^\/api\/lugares$/, (m, q) => lugares(q.get("q") || "")],
  ];

  const partes = (path) => { const [caminho, busca = ""] = path.split("?"); return [caminho, new URLSearchParams(busca)]; };

  function get(path, { cacheable = true } = {}) {
    if (cacheable && cache.has(path)) return cache.get(path);
    const [caminho, q] = partes(path);
    let p;
    for (const [re, fn] of ROTAS) {
      const m = caminho.match(re);
      if (m) { p = fn(m, q); break; }
    }
    p = p || request(path);
    if (cacheable) {
      cache.set(path, p);
      p.catch(() => cache.delete(path));
    }
    return p;
  }

  const exportUrl = (formato, mes) => `${R}/export?format=${formato}${mes ? `&month=${encodeURIComponent(mes)}` : ""}`;

  /* URL (relativa) para <img src> e links de download */
  function url(path) {
    if (!path) return "";
    const [caminho, q] = partes(path);
    const m = caminho.match(/^\/api\/nisar\/passagens\/(\d+)\/geojson$/);
    if (m) return `${R}/passes/${m[1]}/geojson`;
    if (caminho === "/api/nisar/geojson") return exportUrl("geojson", q.get("mes"));
    if (caminho === "/api/nisar/exportar") return exportUrl(q.get("formato") || "csv", q.get("mes"));
    return path;
  }

  /* ---------------------------------------------------------------- sessão */
  const USER = "ww-user", OFFLINE = "ww-offline", GUEST = "ww-guest";
  let sessao = null; // promessa de { user, offline }: /api/auth/me roda uma vez por carga da página

  function user() { try { return JSON.parse(ss.get(USER) || "null"); } catch (e) { return null; } }
  function limpar() { ss.del(USER); ss.del(OFFLINE); ss.del(GUEST); sessao = null; }
  function guardar(u, offline, guest = false) {
    ss.set(USER, JSON.stringify(u));
    if (offline) ss.set(OFFLINE, "1"); else ss.del(OFFLINE);
    if (guest) ss.set(GUEST, "1"); else ss.del(GUEST);
    const s = guest ? { user: u, offline, guest } : { user: u, offline };
    sessao = Promise.resolve(s);
    return s;
  }
  const semServidor = (e) => e.status === 502 || e.status === 504;

  /* Login pela ponte do Next. Com o FastAPI inacessível (502/504, nunca 401), só o e-mail da conta
     de demonstração entra, numa sessão offline. */
  async function login(email, password, remember = true) {
    try {
      const res = await request("/api/auth/login", { method: "POST", body: { email, password, remember } });
      return guardar(res.user, false);
    } catch (e) {
      const demo = e.data && e.data.demo_email;
      if (semServidor(e) && demo && email.trim().toLowerCase() === demo.toLowerCase()) {
        console.warn(`[WW.api] Login without the server (${e.message}). Entering with the demo account in offline mode.`);
        return guardar({ name: "Demo account", city: null }, true);
      }
      throw e;
    }
  }

  /* Visitante: entra sem conta e sem senha. A sessão fica só no navegador (sem cookie nem token);
     as rotas de dados que as telas usam são públicas. */
  const VISITANTE = { name: "Visitante", city: "Lajeado" };
  function visitante() { return guardar({ ...VISITANTE }, false, true); }

  /* Valida a sessão do cookie. 401 sempre derruba; 502/504 só mantém uma sessão offline.
     Visitante não tem cookie: a sessão dele não passa pelo servidor. */
  function me() {
    if (sessao) return sessao;
    if (ss.get(GUEST) === "1" && user()) return (sessao = Promise.resolve(guardar(user(), false, true)));
    sessao = request("/api/auth/me").then((res) => guardar(res.user, false), (e) => {
      if (semServidor(e) && ss.get(OFFLINE) === "1" && user()) {
        console.warn(`[WW.api] /api/auth/me failed (${e.message}). Offline demo session.`);
        return guardar(user(), true);
      }
      limpar();
      throw e;
    });
    return sessao;
  }

  async function logout() {
    limpar();
    try { await request("/api/auth/logout", { method: "POST" }); } catch (e) { /* o cookie expira sozinho */ }
  }

  WW.api = {
    // Só para a mensagem de erro das telas: é o endereço do próprio site
    base: (window.location && window.location.origin) || "",
    url,
    ApiError,
    get,
    enso,
    explicacao,
    login,
    visitante,
    me,
    logout,
    user,
    offline: () => ss.get("ww-offline") === "1",
  };
})(window.WW);
