/* ==========================================================================
   Aba 2 — Exploração de dados meteorológicos e topográficos
   Escala de profundidade: planeta → continente → país → estado → município.
   Cada clique no elemento do nível atual desce um nível; o globo faz a
   viagem (rotação + zoom) coerente com a nova escala.
   ========================================================================== */
(function (WW) {
  "use strict";

  const LEVELS = ["planet", "continent", "country", "state", "municipality"];
  const LEVEL_PT = ["Planeta", "Continente", "País", "Estado", "Município"];

  /* ------------------------------------------------ dados simulados */
  const FIXED = {
    SA:  { p7: 41.2, anom: 6, soil: 61, temp: 23.8, f72: 18, alt: 590, top: 6961, topName: "Aconcágua", slope: 4.8, varzea: 12, water: null },
    BRA: { p7: 48.6, anom: 11, soil: 66, temp: 24.9, f72: 22, alt: 320, top: 2995, topName: "Pico da Neblina", slope: 3.9, varzea: 9, water: null },
    43:  { p7: 86.4, anom: 38, soil: 81, temp: 19.6, f72: 54, alt: 300, top: 1398, topName: "Monte Negro", slope: 7.2, varzea: 6, water: 58.3 },
  };
  function munData(f, vale) {
    const id = f.properties.id, r = WW.rng("mun:" + id);
    const inVale = vale.has(id);
    const low = inVale ? 22 + r() * 40 : 60 + r() * 520;
    const d = {
      p7: inVale ? 104 + r() * 58 : 38 + r() * 72,
      anom: Math.round(inVale ? 35 + r() * 40 : -10 + r() * 45),
      soil: Math.round(inVale ? 82 + r() * 12 : 58 + r() * 30),
      temp: 17.6 + r() * 3.6,
      f72: Math.round(inVale ? 48 + r() * 30 : 18 + r() * 40),
      alt: Math.round(low + 90 + r() * 260), low: Math.round(low),
      top: Math.round(low + 260 + r() * 520), topName: "",
      slope: 4 + r() * 14, varzea: Math.round(inVale ? 9 + r() * 14 : 1 + r() * 7),
      water: inVale ? 0.6 + r() * 5.2 : r() * 0.9,
    };
    if (id === "4311403") Object.assign(d, { p7: 132.4, anom: 52, soil: 91, alt: 98, low: 26, top: 412, water: 3.8 });
    // séries para o nível município
    d.days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(2026, 10, 2 + i); return `${dt.getDate()}/${dt.getMonth() + 1}`; });
    d.rain = d.days.map((_, i) => Math.max(0, (Math.sin(i / 2.2 + r() * 2) + 0.6) * (inVale ? 18 : 9) * r() + (i > 9 ? r() * (inVale ? 28 : 8) : 0)));
    const n = 40, valley = 14 + Math.floor(r() * 12);
    d.profile = Array.from({ length: n }, (_, i) => {
      const k = Math.abs(i - valley) / n;
      return d.low + (d.top - d.low) * Math.pow(k * 1.9, 1.35) * (0.85 + r() * 0.15);
    });
    const p0 = new Date(2026, 8, 17);
    d.passes = Array.from({ length: 10 }, (_, i) => {
      const dt = new Date(p0.getTime() + i * 6 * 864e5);
      return { date: `${dt.getDate()}/${dt.getMonth() + 1}`, water: inVale ? r() > (i > 6 ? 0.15 : 0.55) : r() > 0.85 };
    });
    return d;
  }
  // Agregados simulados para estados (choropleth nível país)
  function stateP7(f) { if (f.properties.id === "43") return FIXED[43].p7; const r = WW.rng("uf:" + f.properties.id); return 18 + r() * 52; }

  WW.Explore = function (root, { content, onNavigate, onRequestRegion }) {
    const user = content.user, loc = user.location;
    // Só o Vale do Taquari (o piloto) abre dados; o resto mostra "Em breve"
    const vale = new Set([...content.valeDoTaquari, ...(content.valeMunicipios || []).map((m) => m.id)]);
    const EM_BREVE = "Em breve: piloto no Vale do Taquari";
    const world = window.GEO_WORLD.features;
    const sa = window.GEO_SOUTH_AMERICA;
    const states = window.GEO_BR_STATES.features;
    const muns = window.GEO_RS_MUN.features;
    const byId = (arr, id) => arr.find((f) => f.properties.id === id);
    const saFit = { type: "FeatureCollection", features: sa.features.filter((f) => !["FLK", "SGS"].includes(f.properties.id)) };
    const munCache = new Map();
    const md = (f) => { let d = munCache.get(f); if (!d) { d = munData(f, vale); munCache.set(f, d); } return d; };

    // escala de cor sequencial (verde musgo → verde-mar → menta) para chuva
    let ramp;
    const makeRamp = () => { const c = getComputedStyle(document.documentElement); ramp = d3.interpolateRgbBasis([c.getPropertyValue("--globe-land-2").trim(), "#40826D", "#88D8C0"]); };
    makeRamp();
    const p7Max = 165;

    const S = { level: 0, sel: { continent: null, country: null, state: null, mun: null } };

    root.innerHTML = `
      <div class="map-wrap" id="mapWrap">
        <nav class="crumbs" id="crumbs" aria-label="Escala de navegação"></nav>
        <div class="depth" id="depth" aria-label="Escala de profundidade">
          <div class="depth-track"><div class="depth-fill" id="depthFill"></div></div>
          ${LEVEL_PT.slice(1).map((l, i) => `<div class="depth-step" data-l="${i + 1}"><span><b>${l}</b><span class="z">${content.levels[i + 1].depth}</span></span></div>`).join("")}
        </div>
        <div class="map-hint" id="mapHint" aria-live="polite"></div>
        <a class="btn btn-primary vale-cta" id="valeCta" href="#/vale" hidden>Abrir painel do Vale do Taquari ${WW.icon.chevron}</a>
        <div class="map-legend" id="mapLegend" hidden>
          <div class="lg-title">Chuva acumulada · 7 dias</div>
          <div class="legend"><span>0</span><span class="ramp"></span><span>${p7Max}+ mm</span></div>
        </div>
      </div>
      <aside class="panel scroll" id="panel" aria-live="polite"></aside>`;

    const wrap = WW.$("#mapWrap", root), panel = WW.$("#panel", root);

    /* ------------------------------------------------ camadas do globo */
    const L = (lv) => S.level === lv;
    const layers = [
      { id: "world", features: world, hit: true, hitWhen: () => L(0), label: true,
        style: (f, st, c) => {
          const mine = f.properties.continent === loc.continent;
          if (S.level === 0) {
            const hov = st.hover && st.hover.properties.continent === f.properties.continent;
            return mine ? { fill: hov ? c.hover : c.active, alpha: 0.9, stroke: "rgba(27,23,18,.35)", width: 0.5 }
                        : { fill: c.land, alpha: hov ? 0.95 : 0.8, stroke: c.line, width: 0.4 };
          }
          if (mine && S.level >= 1) return null; // substituído pela camada detalhada
          return { fill: c.land2, alpha: 0.55, stroke: c.line, width: 0.3 };
        } },
      { id: "sa", features: sa.features, hit: true, hitWhen: () => L(1), visible: () => S.level >= 1, label: true,
        style: (f, st, c) => {
          const isBR = f.properties.id === loc.country, hov = st.hover === f;
          if (S.level === 1) {
            if (isBR) return { fill: hov ? c.hover : c.active, alpha: 0.9, stroke: "#FEFADF", width: 1.4, label: f.properties.name, strong: true };
            return { fill: c.land, alpha: hov ? 1 : 0.85, stroke: c.line, width: 0.6, label: f.properties.name };
          }
          if (isBR) return null;
          return { fill: c.land2, alpha: 0.6, stroke: c.line, width: 0.4 };
        } },
      { id: "states", features: states, hit: true, hitWhen: () => L(2), visible: () => S.level >= 2, label: true,
        style: (f, st, c) => {
          const isRS = f.properties.id === loc.state, hov = st.hover === f;
          if (S.level === 2) {
            return { fill: hov ? c.hover : ramp(Math.min(stateP7(f) / p7Max, 1)), alpha: hov ? 0.95 : 0.92,
                     stroke: isRS ? c.active : c.line, width: isRS ? 2.4 : 0.6, label: f.properties.uf, strong: isRS };
          }
          if (isRS) return null;
          return { fill: c.land2, alpha: 0.6, stroke: c.line, width: 0.5 };
        } },
      { id: "muns", features: muns, hit: true, hitWhen: () => S.level >= 3, visible: () => S.level >= 3, label: true,
        style: (f, st, c) => {
          const id = f.properties.id, hov = st.hover === f, mine = id === loc.municipality, sel = id === S.sel.mun;
          if (S.level === 3) {
            return { fill: hov ? c.hover : ramp(Math.min(md(f).p7 / p7Max, 1)), alpha: 0.95,
                     stroke: mine ? c.active : vale.has(id) ? "rgba(254,250,223,.55)" : "rgba(254,250,223,.14)", width: mine ? 2.2 : vale.has(id) ? 0.9 : 0.35,
                     label: vale.has(id) ? f.properties.name : null, strong: mine, minArea: 60 };
          }
          // nível 4
          if (sel) return { fill: c.hover, alpha: 0.42, stroke: c.active, width: 2.6, label: f.properties.name, strong: true };
          return { fill: hov ? c.hover : ramp(Math.min(md(f).p7 / p7Max, 1)), alpha: hov ? 0.6 : 0.38, stroke: "rgba(254,250,223,.22)", width: 0.6, label: f.properties.name, minArea: 2500 };
        } },
    ];

    const globe = new WW.Globe(wrap, {
      label: "Mapa interativo da sua região",
      rotate: [60, 15, 0],
      layers,
      pins: [{ lon: loc.lon, lat: loc.lat, label: "Você" }],
      onHover: (hit, e) => {
        wrap.classList.toggle("is-hover", !!hit && canEnter(hit));
        wrap.classList.toggle("is-blocked", !!hit && !canEnter(hit));
        if (!hit) return WW.tooltip.hide();
        WW.tooltip.show(tipHTML(hit), e.clientX, e.clientY);
      },
      onClick: (hit) => { if (hit && canEnter(hit)) { WW.tooltip.hide(); enter(hit); } },
    });
    globe.state.showPinLabel = false;

    function canEnter(hit) {
      const p = hit.feature.properties;
      if (hit.layer === "world") return p.continent === loc.continent;
      if (hit.layer === "sa") return p.id === loc.country;
      if (hit.layer === "states") return p.id === loc.state;
      return hit.layer === "muns" && vale.has(p.id);
    }
    function tipHTML(hit) {
      const p = hit.feature.properties, ok = canEnter(hit);
      const name = hit.layer === "world" ? p.continent : p.name;
      let extra = "";
      if (hit.layer === "states") extra = `<br><span class="muted">Chuva 7 d: ${WW.fmt(stateP7(hit.feature), 1)} mm (simulado)</span>`;
      if (hit.layer === "muns") extra = `<br><span class="muted">Chuva 7 d: ${WW.fmt(md(hit.feature).p7, 1)} mm (simulado)</span>`;
      const next = ["Continente", "País", "Estado", "Município", "Município"][S.level];
      return `<strong>${WW.esc(name)}</strong>${extra}<br>${ok ? `<span class="go">Clique para abrir · ${next} →</span>` : `<span class="muted">${EM_BREVE}</span>`}`;
    }

    function enter(hit) {
      const p = hit.feature.properties;
      if (hit.layer === "world") return onRequestRegion();
      if (hit.layer === "sa") return onNavigate(["SA", p.id]);
      if (hit.layer === "states") return onNavigate(["SA", loc.country, p.id]);
      if (hit.layer === "muns") return onNavigate(["SA", loc.country, loc.state, p.id]);
    }

    /* ------------------------------------------------ navegação */
    const PAD = () => (innerWidth < 760 ? { t: 110, r: 20, b: 80, l: 20 } : { t: 130, r: 48, b: 100, l: 190 });
    function targetFor(level) {
      if (level === 1) return saFit;
      if (level === 2) return byId(sa.features, loc.country);
      if (level === 3) return byId(states, loc.state);
      if (level === 4) return byId(muns, S.sel.mun);
      return null;
    }

    function go(path, { from } = {}) {
      const lvl = Math.min(path.length, 4);
      S.level = lvl;
      S.sel = { continent: path[0] || null, country: path[1] || null, state: path[2] || null, mun: path[3] || null };
      // valida o caminho (somente a região do usuário até o estado)
      if (lvl >= 1 && path[0] !== loc.continentKey) return onNavigate([]);
      if (lvl >= 2 && path[1] !== loc.country) return onNavigate(["SA"]);
      if (lvl >= 3 && path[2] !== loc.state) return onNavigate(["SA", loc.country]);
      if (lvl === 4 && !byId(muns, path[3])) return onNavigate(["SA", loc.country, loc.state]);

      globe.state.level = lvl;
      globe.state.showPinLabel = lvl >= 3;
      globe.hover = null; globe.dirty = true;
      if (from) { globe.view = Object.assign({}, globe.planetView(from)); globe.dirty = true; globe.draw(); }
      const t = targetFor(lvl);
      const view = t ? globe.fit(t, PAD()) : globe.planetView([60, 15, 0]);
      globe.flyTo(view, { duration: lvl === 4 ? 1100 : 1500, fitTarget: t, pad: PAD() });
      renderChrome();
      renderPanel();
    }

    /* ------------------------------------------------ chrome do mapa */
    function crumbsData() {
      const out = [{ label: "Planeta", path: [] }];
      if (S.level >= 1) out.push({ label: loc.continent, path: ["SA"] });
      if (S.level >= 2) out.push({ label: loc.countryName, path: ["SA", loc.country] });
      if (S.level >= 3) out.push({ label: loc.stateName, path: ["SA", loc.country, loc.state] });
      if (S.level >= 4) out.push({ label: byId(muns, S.sel.mun).properties.name, path: ["SA", loc.country, loc.state, S.sel.mun] });
      return out;
    }
    function renderChrome() {
      const cr = crumbsData();
      WW.$("#crumbs", root).innerHTML = cr.map((c, i) => (i ? `<svg class="crumb-sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>` : "")
        + `<button class="crumb" data-path="${c.path.join("/")}" ${i === cr.length - 1 ? 'aria-current="page"' : ""}>${WW.esc(c.label)}</button>`).join("");
      WW.$$(".depth-step", root).forEach((el) => {
        const l = +el.dataset.l;
        el.classList.toggle("is-on", l === S.level); el.classList.toggle("is-past", l < S.level);
      });
      WW.$("#depthFill", root).style.setProperty("--fill", `${Math.max(0, (S.level - 1) / 3) * 100}%`);
      const munName = S.sel.mun ? byId(muns, S.sel.mun).properties.name : "";
      const hints = [
        `Clique na <b>${loc.continent}</b> para acessar os dados da sua região`,
        `Clique no <b>${loc.countryName}</b> para descer ao nível País`,
        `Clique no <b>${loc.stateName}</b> para descer ao nível Estado`,
        `Clique em <b>${loc.municipalityName}</b> ou outro município para descer ao nível Município`,
        `Nível mais detalhado · <b>${WW.esc(munName)}</b> · clique em um vizinho para comparar`,
      ];
      WW.$("#mapHint", root).innerHTML = `<span class="pulse-dot"></span><span>${hints[S.level]}</span>`
        + (S.level > 0 ? `<button class="btn btn-icon btn-ghost" id="upBtn" aria-label="Voltar um nível" title="Voltar um nível">${WW.icon.back}</button>` : "");
      WW.$("#mapLegend", root).hidden = S.level < 2;
      WW.$("#valeCta", root).hidden = S.level < 3;
    }
    root.addEventListener("click", (e) => {
      const c = e.target.closest(".crumb");
      if (c && !c.hasAttribute("aria-current")) onNavigate(c.dataset.path ? c.dataset.path.split("/") : []);
      if (e.target.closest("#upBtn")) onNavigate(crumbsData()[S.level - 1].path);
      const ch = e.target.closest(".child[data-path]");
      if (ch && !ch.disabled) {
        if (ch.dataset.path === "@region") onRequestRegion();
        else onNavigate(ch.dataset.path.split("/"));
      }
    });

    /* ------------------------------------------------ painel lateral */
    function metricsHTML(d, { sar = true } = {}) {
      const up = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
      return `
        <div class="section-title"><h3>Meteorologia</h3><span class="badge-demo">simulado</span></div>
        <div class="metric-grid">
          ${WW.metric({ label: "Chuva · 7 dias", value: WW.fmt(d.p7, 1), unit: " mm", delta: `${d.anom > 0 ? "+" : ""}${d.anom}% vs. média`, dir: up(d.anom), icon: "rain" })}
          ${WW.metric({ label: "Previsão · 72 h", value: WW.fmt(d.f72), unit: " mm", icon: "rain" })}
          ${WW.metric({ label: "Umidade do solo", value: WW.fmt(d.soil), unit: "%", icon: "drop" })}
          ${WW.metric({ label: "Temp. média", value: WW.fmt(d.temp, 1), unit: " °C", icon: "temp" })}
        </div>
        <div class="section-title"><h3>Topografia</h3></div>
        <div class="metric-grid">
          ${WW.metric({ label: "Altitude média", value: WW.fmt(d.alt), unit: " m", kind: "terrain", icon: "mountain" })}
          ${WW.metric({ label: d.topName ? `Ponto mais alto` : "Altitude máx.", value: WW.fmt(d.top), unit: " m", delta: d.topName || (d.low != null ? `mín. ${WW.fmt(d.low)} m` : ""), kind: "terrain", icon: "mountain" })}
          ${WW.metric({ label: "Declividade média", value: WW.fmt(d.slope, 1), unit: "%", kind: "terrain", icon: "slope" })}
          ${WW.metric({ label: "Área de várzea", value: WW.fmt(d.varzea), unit: "%", kind: "terrain", icon: "area" })}
        </div>
        ${sar ? `<div class="section-title"><h3>Radar · SAR</h3></div>
        <div class="metric-grid">
          ${WW.metric({ label: "Passagens NISAR", value: "21", unit: " desde jun", kind: "sar", icon: "radar" })}
          ${WW.metric({ label: "Água observada", value: d.water == null ? "—" : WW.fmt(d.water, 1), unit: d.water == null ? "" : " km²", delta: d.water == null ? "fora da área-piloto" : "última passagem", kind: "sar", icon: "wave" })}
        </div>` : ""}`;
    }

    function childButton({ name, sub, path, mine, enabled, tag }) {
      return `<button class="child ${mine ? "is-mine" : ""}" ${enabled ? `data-path="${path}"` : "disabled"} type="button">
        <span><span class="c-name">${WW.esc(name)}</span>${sub ? `<br><span class="c-sub">${WW.esc(sub)}</span>` : ""}</span>
        ${tag ? `<span class="c-tag">${WW.esc(tag)}</span>` : WW.icon.chevron}
      </button>`;
    }

    function renderPanel() {
      const lv = content.levels[S.level];
      let title, sub, body = "";
      if (S.level === 0) {
        title = "Escolha sua região";
        sub = "Comece pelo continente onde você está. Os dados abrem em escala: continente, país, estado e município.";
        const conts = ["América do Sul", "América do Norte", "Europa", "África", "Ásia", "Oceania"];
        body = `<div class="section-title"><h3>Continentes</h3></div><div class="child-list">${conts.map((c) => childButton({
          name: c, sub: c === loc.continent ? "Sua região" : EM_BREVE, path: "@region", mine: c === loc.continent, enabled: c === loc.continent, tag: c === loc.continent ? "Acessar" : "" })).join("")}</div>`;
      } else if (S.level === 1) {
        title = loc.continent; sub = `${sa.features.length} países e territórios · dados meteorológicos e topográficos do continente.`;
        const list = sa.features.slice().sort((a, b) => (a.properties.id === loc.country ? -1 : b.properties.id === loc.country ? 1 : a.properties.name.localeCompare(b.properties.name)));
        body = metricsHTML(FIXED.SA, { sar: true }) + `<div class="section-title"><h3>Países</h3><span class="kicker">próximo nível</span></div><div class="child-list">${list.map((f) => childButton({
          name: f.properties.name, sub: f.properties.id === loc.country ? "Seu país" : EM_BREVE, path: `SA/${f.properties.id}`, mine: f.properties.id === loc.country, enabled: f.properties.id === loc.country })).join("")}</div>`;
      } else if (S.level === 2) {
        title = loc.countryName; sub = "27 unidades da federação · cor = chuva acumulada em 7 dias.";
        const list = states.slice().sort((a, b) => (a.properties.id === loc.state ? -1 : b.properties.id === loc.state ? 1 : a.properties.name.localeCompare(b.properties.name)));
        body = metricsHTML(FIXED.BRA) + `<div class="section-title"><h3>Estados</h3><span class="kicker">próximo nível</span></div><div class="child-list">${list.map((f) => childButton({
          name: f.properties.name, sub: f.properties.id === loc.state ? "Seu estado" : `${f.properties.uf} · ${EM_BREVE}`, path: `SA/${loc.country}/${f.properties.id}`, mine: f.properties.id === loc.state, enabled: f.properties.id === loc.state })).join("")}</div>`;
      } else if (S.level === 3) {
        title = loc.stateName; sub = `${muns.length} municípios · contorno claro = ${loc.regionName}.`;
        body = metricsHTML(FIXED[43]) + `<div class="section-title"><h3>Municípios</h3><span class="kicker">próximo nível</span></div>
          <input class="search" id="munSearch" type="search" placeholder="Buscar município…" aria-label="Buscar município">
          <div class="child-list" id="munList"></div>`;
      } else if (!vale.has(S.sel.mun)) {
        // Fora do piloto: nada de números, nem simulados
        title = byId(muns, S.sel.mun).properties.name; sub = loc.stateName;
        body = `<div class="soon"><b>${EM_BREVE}</b><p>Por enquanto, o Water Waltz mostra os dados do radar NISAR só no Vale do Taquari. Outras regiões entram depois do piloto.</p>
          <a class="btn btn-primary" href="#/vale">Abrir o Vale do Taquari ${WW.icon.chevron}</a></div>`;
      } else {
        const f = byId(muns, S.sel.mun), d = md(f), name = f.properties.name, inVale = vale.has(f.properties.id);
        title = name; sub = `${inVale ? loc.regionName + " · " : ""}${loc.stateName}${f.properties.id === loc.municipality ? " · onde você está" : ""}`;
        const news = content.news.filter((n) => n.region === loc.region);
        body = metricsHTML(d) + `
          <div class="section-title"><h3>Séries</h3><span class="badge-demo">simulado</span></div>
          <div class="chart-card"><div class="cc-title"><span>Chuva diária</span><span>últimos 14 dias</span></div>${WW.charts.bars(d.rain, { labels: d.days })}</div>
          <div class="chart-card"><div class="cc-title"><span>Perfil de elevação</span><span>corte no vale do rio</span></div>${WW.charts.profile(d.profile)}</div>
          <div class="chart-card"><div class="cc-title"><span>Passagens do radar</span><span>● água · ○ sem água</span></div>${WW.charts.passes(d.passes)}</div>
          ${inVale ? `<div class="section-title"><h3>Notícias deste lugar</h3></div><div>${news.slice(0, 2).map((n) => WW.newsItem(n, { thumb: false })).join("")}</div>` : ""}
          <p class="note">Indicador candidato de mudança de água, não é um mapa de inundação validado. Não use para decidir evacuação ou rotas. Valores desta tela são de demonstração.</p>`;
      }
      panel.innerHTML = `
        <div class="panel-swap">
          <header class="panel-head">
            <div class="kicker"><span>Nível ${S.level} · ${LEVEL_PT[S.level]}</span>${S.level ? `<span>${lv.depth}</span>` : ""}</div>
            <h2>${WW.esc(title)}</h2>
            <p>${WW.esc(sub)}</p>
          </header>
          ${WW.mediaCard({ img: lv.img, kicker: lv.kicker || "Water Waltz", title: lv.cardTitle || "Dados em escala." })}
          ${body}
        </div>`;
      panel.scrollTop = 0;
      if (S.level === 3) {
        const listEl = WW.$("#munList", panel), q = WW.$("#munSearch", panel);
        const draw = () => {
          const term = q.value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
          const pool = term
            ? muns.filter((f) => f.properties.name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(term)).slice(0, 30)
            : content.valeDoTaquari.map((id) => byId(muns, id)).filter(Boolean);
          listEl.innerHTML = pool.map((f) => childButton({
            name: f.properties.name, sub: f.properties.id === loc.municipality ? "Você está aqui" : vale.has(f.properties.id) ? loc.regionName : "",
            path: `SA/${loc.country}/${loc.state}/${f.properties.id}`, mine: f.properties.id === loc.municipality, enabled: vale.has(f.properties.id),
            tag: vale.has(f.properties.id) ? `${WW.fmt(md(f).p7, 0)} mm` : "Em breve" })).join("") || `<p class="rail-empty">Nenhum município encontrado.</p>`;
        };
        q.addEventListener("input", draw); draw();
      }
    }

    return {
      go,
      show() { globe.refreshColors(); globe.resize(); globe.start(); },
      hide() { globe.stop(); WW.tooltip.hide(); },
      theme() { makeRamp(); globe.refreshColors(); },
      get level() { return S.level; },
    };
  };
})(window.WW);
