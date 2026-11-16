/* ==========================================================================
   Vale do Taquari — tela inicial (#/vale) e dados detalhados (#/vale/dados).
   Todos os números vêm da API (backend/), nada é simulado aqui:
     /api/regions/vale-do-taquari      rio, cidades (sedes) e caixa da região
     /api/nisar/resumo?mes=            frase da situação e números do mês
     /api/nisar/passagens(?mes=)       passagens, imagens de radar
     /api/nisar/geojson?mes=           polígonos de cheia e seca
     /api/nisar/municipios(/geojson)   área por município e malha do IBGE
     /api/nisar/metadados              metadados e disponibilidade de vegetação alagada
     /api/previsao                     previsão do tempo (Open-Meteo)
     /api/lugares?q=                   busca por cidade (IBGE) ou bairro (OSM)
   ========================================================================== */
(function (WW) {
  "use strict";

  const MES = "2026-07";
  const LOCAL = "Vale do Taquari (RS)";
  const MES_NOME = "July 2026";
  const STAMP = `${LOCAL} · ${MES_NOME}`;
  const api = (p) => WW.api.get(p);
  const km2 = (v, d = 1) => (v == null ? "—" : WW.fmt(v, d) + " km²");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dBR = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; };
  const dLong = (iso) => String(iso).slice(0, 10);
  const orbita = (t) => t.split("_").slice(0, 2).join("_");
  const orbitaNome = (t) => (t.includes("_A_") ? "ascending" : "descending");
  const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* d3 trata polígonos com orientação invertida como "o resto do mundo";
     aqui cada anel é corrigido para a menor área. */
  function rewind(fc) {
    const fix = (ring) => (d3.geoArea({ type: "Polygon", coordinates: [ring] }) > 2 * Math.PI ? ring.slice().reverse() : ring);
    for (const f of fc.features) {
      const g = f.geometry;
      if (g.type === "Polygon") g.coordinates = g.coordinates.map(fix);
      else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((p) => p.map(fix));
    }
    return fc;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const haversineKm = (a, b) => d3.geoDistance(a, b) * 6371;

  /* ------------------------------------------------ dados compartilhados */
  let base = null;
  function loadBase() {
    if (!base) {
      base = Promise.all([
        api("/api/regions/vale-do-taquari"),
        api(`/api/nisar/resumo?mes=${MES}`),
        api(`/api/nisar/passagens?mes=${MES}`),
        api("/api/nisar/municipios/geojson").then((g) => rewind(clone(g))),
        api(`/api/nisar/geojson?mes=${MES}`).then((g) => rewind(clone(g))),
      ]).then(([region, resumo, passagens, muni, change]) => ({
        region, resumo, passagens: passagens.itens, muni, change,
        // fonte das passagens; se algo veio do plano B, a tela inteira é "Dado salvo (offline)"
        origem: [passagens.origem, change.origem].includes("local") ? "local" : passagens.origem,
      }));
      base.catch(() => { base = null; });
    }
    return base;
  }

  /* Situação de um ponto/município: distância até a água fora do normal mais próxima */
  function situacao(data, lon, lat) {
    let best = null;
    for (const f of data.change.features) {
      if (f.properties.classe !== "cheia") continue;
      const km = haversineKm([lon, lat], d3.geoCentroid(f));
      if (!best || km < best.km) best = { km, data: f.properties.data };
    }
    if (!best) return { nivel: "ok", label: "No new water nearby", best };
    if (best.km <= 1.5) return { nivel: "alert", label: "New water nearby", best };
    if (best.km <= 3) return { nivel: "warn", label: "May be affected", best };
    return { nivel: "ok", label: "No new water nearby", best };
  }

  /* ------------------------------------------------ mapa simplificado (SVG) */
  function ValeMap(el, { compact = false } = {}) {
    el.innerHTML = `<svg class="vmap" role="img" aria-label="Simplified map of the ${LOCAL}"></svg>`;
    const svg = d3.select(el).select("svg");
    let data = null, marker = null, selectedDate = null;
    const show = { radar: false, cheia: true, seca: true, muni: true, rio: true };
    const proj = d3.geoMercator();
    const path = d3.geoPath(proj);

    function draw() {
      if (!data) return;
      const w = el.clientWidth || 600, h = el.clientHeight || 420;
      svg.attr("viewBox", `0 0 ${w} ${h}`);
      const c = data.resumo.area_coberta;
      const coverPoly = { type: "Polygon", coordinates: [[[c.oeste, c.sul], [c.oeste, c.norte], [c.leste, c.norte], [c.leste, c.sul], [c.oeste, c.sul]]] };
      const focus = compact ? data.muni : { type: "FeatureCollection", features: [{ type: "Feature", geometry: coverPoly }] };
      proj.fitExtent([[16, 16], [w - 16, h - 16]], focus);
      svg.selectAll("*").remove();
      svg.append("defs").append("clipPath").attr("id", "vm-clip" + (compact ? "c" : "d")).append("path").attr("d", path(coverPoly));

      if (show.muni) {
        svg.append("g").attr("class", "vm-muni").selectAll("path").data(data.muni.features).join("path")
          .attr("d", path).append("title").text((f) => f.properties.name);
      }
      if (show.radar && selectedDate) {
        const p = data.passagens.find((x) => x.data === selectedDate);
        const [x0, y0] = proj([c.oeste, c.norte]), [x1, y1] = proj([c.leste, c.sul]);
        svg.append("image").attr("class", "vm-radar").attr("href", WW.api.url(p.imagens.radar))
          .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0)
          .attr("preserveAspectRatio", "none").attr("clip-path", `url(#vm-clip${compact ? "c" : "d"})`);
        // marca-texto de alagamento (azul) e seca (laranja) sobre a imagem de radar, na mesma caixa da imagem
        const HL = WW.radarHighlight, col = HL.colors();
        const pp = HL.paths({ features: data.change.features.filter((f) => f.properties.data === selectedDate && show[f.properties.classe]) }, c, [x0, y0, x1, y1]);
        const sw = (HL.STROKE * (x1 - x0)) / HL.RADAR_W;
        const hl = svg.append("g").attr("class", "vm-hl").attr("opacity", HL.OPACITY).attr("clip-path", `url(#vm-clip${compact ? "c" : "d"})`);
        for (const k of ["seca", "cheia"]) {
          if (!pp[k].length) continue;
          hl.append("path").attr("d", pp[k].join("")).attr("fill", col[k]).attr("stroke", col[k])
            .attr("stroke-width", sw).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
        }
      }
      svg.append("path").attr("class", "vm-cover").attr("d", path(coverPoly));
      const [lx, ly] = proj([c.oeste, c.norte]);
      svg.append("text").attr("class", "vm-cover-label").attr("x", lx + 8).attr("y", ly + 18).text("Area observed by the radar");

      // traçado simplificado do rio; com o radar visível o próprio leito aparece na imagem
      const river = data.region.river;
      if (river && show.rio && !show.radar) svg.append("path").attr("class", "vm-river").attr("d", path({ type: "LineString", coordinates: river.coordinates }));

      const feats = data.change.features.filter((f) => (!selectedDate || f.properties.data === selectedDate) && show[f.properties.classe]);
      const g = svg.append("g").attr("class", "vm-change");
      g.selectAll("path").data(feats).join("path").attr("class", (f) => "vm-" + f.properties.classe).attr("d", path);
      g.selectAll("circle").data(feats).join("circle").attr("class", (f) => "vm-ring vm-" + f.properties.classe)
        .attr("r", compact ? 5 : 7).attr("cx", (f) => path.centroid(f)[0]).attr("cy", (f) => path.centroid(f)[1])
        .append("title").text((f) => `${f.properties.classe === "cheia" ? "Water above normal" : "Water below normal"} · ${dBR(f.properties.data)} · ${WW.fmt(f.properties.area_km2 * 1e6, 0)} m²`);

      const cities = svg.append("g").attr("class", "vm-cities").selectAll("g").data(data.region.cities).join("g")
        .attr("transform", (d) => `translate(${proj([d.lon, d.lat])})`);
      cities.append("circle").attr("r", 3.5);
      cities.append("text").attr("x", 7).attr("y", 4).text((d) => d.name);

      if (marker) {
        const [mx, my] = proj([marker.lon, marker.lat]);
        const m = svg.append("g").attr("class", "vm-marker").attr("transform", `translate(${mx},${my})`);
        m.append("circle").attr("r", 9);
        m.append("circle").attr("r", 3.5).attr("class", "dot");
      }
    }

    const ro = new ResizeObserver(draw); ro.observe(el);
    return {
      set(d) { data = d; draw(); },
      mark(m) { marker = m; draw(); },
      date(iso) { selectedDate = iso; draw(); },
      layer(name, on) { show[name] = on; draw(); },
    };
  }

  /* ------------------------------------------------ blocos reutilizáveis */
  const stamp = (extra = "") => `<p class="stamp">${WW.icon.pin}<span>${STAMP}${extra ? " · " + extra : ""}</span></p>`;
  const loading = (txt = "Loading data from the server…") => `<div class="v-state">${txt}</div>`;
  const failed = (e) => `<div class="v-state v-error"><b>Could not load.</b><br>${WW.esc(e.message || e)}<br>
    <small>Check that the API is running at ${WW.esc(WW.api.base)} (see frontend/README.md).</small></div>`;
  const levelBadge = (cls, label) => `<span class="v-level v-level-${cls}"><span class="dot"></span>${WW.esc(label)}</span>`;

  function forecastHTML(f) {
    const max = Math.max(10, ...f.dias.map((d) => d.chuva_mm || 0));
    const bars = f.dias.map((d) => {
      const dt = new Date(d.data + "T12:00:00");
      const h = Math.round(((d.chuva_mm || 0) / max) * 64);
      return `<li title="${dLong(d.data)}: ${WW.fmt(d.chuva_mm || 0, 1)} mm, ${d.prob_chuva ?? "—"}% chance">
        <span class="fc-mm">${WW.fmt(d.chuva_mm || 0, 0)}</span>
        <span class="fc-bar" style="height:${Math.max(h, 2)}px"></span>
        <span class="fc-day">${WEEK[dt.getDay()]}<br><small>${dBR(d.data)}</small></span>
      </li>`;
    }).join("");
    const hora = new Date(f.gerado_em).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `<p class="fc-frase">${WW.esc(f.frase)}</p><ul class="fc-bars" aria-label="Forecast rain per day (mm)">${bars}</ul>
      <p class="fc-note">Rain in mm per day · ${WW.esc(f.fonte)} · updated at ${hora}. This is a weather forecast, not a flood forecast, and it does not replace the alerts of the Defesa Civil (Civil Defense).</p>`;
  }

  function imagesHTML(d, n) {
    const p = d.passagens.find((x) => x.n === n) || d.passagens[0];
    return `<div class="v-images">
      <figure class="v-fig"><img src="assets/img/vale-ilustrado.webp" alt="Illustration of the Vale do Taquari with the river and the towns">
        <figcaption><b>Illustration</b><span>${STAMP}</span></figcaption></figure>
      <figure class="v-fig"><img src="${WW.api.url(p.imagens.radar)}" data-radar-n="${p.n}" data-radar-kind="radar" alt="NISAR radar image of ${dLong(p.data)} over the Vale do Taquari. Water looks dark; towns look bright." loading="lazy">
        <figcaption><b>Radar NISAR · ${dLong(p.data)}</b><span>${LOCAL} · ${orbitaNome(p.trilha)} orbit (${orbita(p.trilha)})</span></figcaption></figure>
    </div>`;
  }

  const LEVEL = { normal: ["ok", "No flooding"], atencao: ["warn", "Watch"], alagamento: ["alert", "Flooding"], sem_dados: ["none", "No data"] };

  /* ------------------------------------------------ histórico do Sentinel-1 (/recurrence) */
  const MESES_NOME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mesNome = (ym) => { const [a, m] = ym.split("-"); return `${MESES_NOME[+m - 1]} ${a}`; };
  const CLASSE_REC = { pontual: "One-off", voltou: "Flooded again", recorrente: "Recurrent", permanente: "Permanent water", sem_registro: "No record" };
  const DESC_REC = { pontual: "Flooded in a single month since 2014", voltou: "Flooded in 2 to 3 different months since 2014",
    recorrente: "Flooded in 4 or more months since 2014", permanente: "Water in at least half of the passes (riverbed)" };
  const TIPO_LUGAR = { "município": "municipality", bairro: "neighbourhood" };
  const notaRec = (r) => `Real Sentinel-1 history (C-band, VV), ${WW.fmt(r.images, 0)} passes of orbit ${r.relative_orbit} between ${dLong(r.period_start)} and ${dLong(r.period_end)}. `
    + `Water = backscatter below ${r.threshold_db} dB, leaving out steep slopes. It counts in how many different months each point flooded outside the riverbed. `
    + "It is a recurrence indicator, not an official risk map. The satellite passes every 12 days and Taquari floods rise and fall in 2 or 3, so the peak is often missed; "
    + "the radar also cannot see water between buildings or under dense vegetation. So a town with \"no record\" may still have flooded.";

  function recorrenciaHTML(r) {
    const top = r.monthly.slice().sort((a, b) => b.flooded_km2 - a.flooded_km2).slice(0, 3);
    const frase = `${WW.fmt(r.images, 0)} Sentinel-1 passes (European C-band radar) between ${dLong(r.period_start)} and ${dLong(r.period_end)}. ` +
      `Months with the most water outside the riverbed: ${top.map((m) => `${mesNome(m.month)} (${km2(m.flooded_km2)})`).join(", ")}.`;
    return `<p class="fc-frase">${WW.esc(frase)}</p>
      <div class="rec-chart" id="vRecChart" role="img" aria-label="Area with water outside the riverbed per month, ${r.period_start.slice(0, 4)} to ${r.period_end.slice(0, 4)}. ${WW.esc(top.map((m) => `${mesNome(m.month)}: ${WW.fmt(m.flooded_km2, 1)} km²`).join("; "))}"></div>
      <p class="fc-note rec-gap">Each bar is a month with a satellite pass on this orbit. A month without a bar had no pass (Sentinel-1B stopped in December 2021): it does not mean there was no flood.</p>
      <dl class="v-nums rec-classes">${r.classes.map((c) => `<div><dt>${WW.esc(CLASSE_REC[c.class] || c.class)}</dt><dd>${km2(c.area_km2)}</dd><dd class="rec-desc">${WW.esc(DESC_REC[c.class] || c.description)}</dd></div>`).join("")}</dl>
      <table class="v-table"><thead><tr><th scope="col">Town</th><th scope="col">Class</th><th scope="col" class="num">Urban area that flooded</th></tr></thead>
        <tbody>${r.cities.map((c) => `<tr><th scope="row">${WW.esc(c.name)}</th><td>${WW.esc(CLASSE_REC[c.class] || c.class)}</td><td class="num">${WW.fmt(c.flooded_share * 100, 1)}%</td></tr>`).join("")}</tbody></table>
      <p class="fc-note">${WW.esc(notaRec(r))}</p>`;
  }

  function desenharSerie(el, monthly) {
    if (!el || !monthly.length) return;
    const w = el.clientWidth || 720, h = 170, m = { t: 22, r: 8, b: 22, l: 36 };
    const pts = monthly.map((x) => ({ ...x, t: new Date(x.month + "-15T12:00:00") }));
    const x = d3.scaleTime().domain([new Date(pts[0].t.getFullYear(), 0, 1), new Date(pts[pts.length - 1].t.getFullYear() + 1, 0, 1)]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.flooded_km2)]).nice().range([h - m.b, m.t]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("aria-hidden", "true");
    svg.append("g").attr("class", "rec-axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(w < 500 ? 2 : 1)).tickFormat(d3.timeFormat("%Y")).tickSizeOuter(0));
    svg.append("g").attr("class", "rec-axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => `${v}`).tickSizeOuter(0));
    svg.append("text").attr("class", "rec-unit").attr("x", m.l).attr("y", 12).text("km² of water outside the riverbed");
    const bw = Math.max(2, (x(new Date(2016, 0, 1)) - x(new Date(2015, 0, 1))) / 14);
    svg.append("g").selectAll("rect").data(pts).join("rect").attr("class", "rec-bar")
      .attr("x", (p) => x(p.t) - bw / 2).attr("width", bw).attr("y", (p) => y(p.flooded_km2)).attr("height", (p) => y(0) - y(p.flooded_km2))
      .append("title").text((p) => `${mesNome(p.month)}: ${WW.fmt(p.flooded_km2, 1)} km² (${p.images} passagens)`);
    const top = pts.slice().sort((a, b) => b.flooded_km2 - a.flooded_km2).slice(0, 3);
    svg.append("g").selectAll("text").data(top).join("text").attr("class", "rec-label").attr("text-anchor", "middle")
      .attr("x", (p) => Math.min(w - 40, Math.max(m.l + 30, x(p.t)))).attr("y", (p) => y(p.flooded_km2) - 5)
      .text((p) => `${MESES_NOME[p.t.getMonth()].slice(0, 3)}/${String(p.t.getFullYear()).slice(2)}`);
  }

  /* ------------------------------------------------ minha casa: em quantas das passagens o radar viu água perto */
  const CASA = "ww-casa";
  const lerCasa = () => { try { return JSON.parse(localStorage.getItem(CASA) || "null"); } catch (e) { return null; } };
  const gravarCasa = (v) => { try { if (v) localStorage.setItem(CASA, JSON.stringify(v)); else localStorage.removeItem(CASA); return true; } catch (e) { return false; } };
  let historicoP = null;
  function historicoNisar() {
    if (!historicoP) {
      historicoP = Promise.all([api("/api/nisar/passagens"), api("/api/regions/vale-do-taquari/export?format=geojson").then((g) => rewind(clone(g)))])
        .then(([ps, g]) => ({
          passes: ps.itens,
          cheia: g.features.filter((f) => f.properties.class === "cheia").map((f) => ({ data: f.properties.date, c: d3.geoCentroid(f) })),
        }));
      historicoP.catch(() => { historicoP = null; });
    }
    return historicoP;
  }
  function contarPerto(h, lon, lat, raioKm = 3) {
    const datas = new Set(h.cheia.filter((x) => haversineKm([lon, lat], x.c) <= raioKm).map((x) => x.data));
    const hits = h.passes.filter((p) => datas.has(p.data));
    return { k: hits.length, n: h.passes.length, datas: hits.map((p) => p.data) };
  }

  /* ================================================== tela inicial */
  WW.ValeHome = function (root) {
    root.innerHTML = `
      <div class="vale scroll">
        <header class="v-head">
          <div>
            <div class="kicker">${WW.icon.pin.replace("<svg", '<svg width="14" height="14"')} ${LOCAL}</div>
            <h1>How is the <em>water</em> in the valley</h1>
          </div>
          <div class="v-head-chips"><span class="enso-slot" id="vEnso"></span><span class="chip">${MES_NOME}</span><span class="chip chip-water"><span class="dot live"></span>NISAR radar · L-band</span><a class="btn btn-primary v-head-cta" href="#/vale/dados">Detailed data ${WW.icon.chevron}</a></div>
        </header>
        <div class="v-home-grid">
          <section class="v-card v-map-card" aria-label="Map of the valley">
            <div class="v-search" role="search">
              ${WW.icon.search}
              <input id="vSearch" type="search" placeholder="Search a town or neighbourhood…" autocomplete="off" aria-label="Search a town or neighbourhood" aria-controls="vResults">
              <ul class="v-results" id="vResults" role="listbox" hidden></ul>
            </div>
            <div class="v-map" id="vMap">${loading()}</div>
            <div class="v-map-foot">
              <div class="v-legend"><span><i class="lg-river"></i>Rio Taquari</span><span><i class="lg-cover"></i>Observed area</span><span><i class="lg-cheia"></i>Water above normal</span></div>
              ${stamp()}
            </div>
            <div class="v-place" id="vPlace" aria-live="polite" hidden></div>
          </section>

          <aside class="v-side">
            <section class="v-card v-status" id="vStatus">${loading()}</section>
            <section class="v-card v-forecast" id="vForecast"><h2 class="v-h2">Forecast · next 7 days</h2>${loading("Fetching the forecast…")}</section>
            <section class="v-card v-scenario" id="vCenario" aria-labelledby="h-cen"><h2 class="v-h2" id="h-cen">Scenario · what if it rains like this?</h2>${loading("Building the scenario…")}</section>
            <a class="btn btn-primary v-cta" href="#/vale/dados">See detailed data ${WW.icon.chevron}</a>
          </aside>
        </div>
        <section class="v-card" id="vImages" aria-label="Images"><h2 class="v-h2">Images of the month</h2>${loading()}</section>
        ${WW.mode.isDeep() ? `<section class="v-card v-deep" id="vTech" aria-labelledby="h-tech" style="margin-top:var(--s4)">
          <div class="v-card-head"><h2 class="v-h2" id="h-tech">Technical data · In-depth mode</h2><a class="btn" href="#/vale/dados">${WW.icon.download} Export from the data panel</a></div>
          <div class="v-deep-grid"><div id="vTechNisar">${loading()}</div><div id="vTechPrev">${loading("Fetching the forecast…")}</div></div>
        </section>` : ""}
      </div>`;

    WW.EnsoBadge(WW.$("#vEnso", root));
    const map = ValeMap(WW.$("#vMap", root), { compact: true });
    let data = null;

    loadBase().then((d) => {
      data = d;
      map.set(d);
      // a casa salva aparece sozinha (mostrar e place são da busca, abaixo; o then roda depois)
      const casa = lerCasa();
      if (casa && casa.nome) { WW.$("#vSearch", root).value = casa.nome; mostrar(casa); }
      const r = d.resumo, [cls, lbl] = LEVEL[r.nivel] || LEVEL.sem_dados;
      WW.$("#vStatus", root).innerHTML = `
        <div class="v-status-top">${levelBadge(cls, lbl)}<span class="kicker">${MES_NOME}</span></div>
        <p class="v-frase">${WW.esc(r.frase)}</p>
        <dl class="v-nums">
          <div><dt>Radar passes</dt><dd>${r.passagens}</dd></div>
          <div><dt>Water above normal</dt><dd>${km2(r.cheia_km2)}</dd></div>
          <div><dt>Water below normal</dt><dd>${km2(r.seca_km2)}</dd></div>
        </dl>
        ${stamp("Muçum–Lajeado stretch")}`;
      const pico = r.pico ? d.passagens.find((p) => p.data === r.pico.data) : d.passagens[d.passagens.length - 1];
      WW.$("#vImages", root).innerHTML = `<h2 class="v-h2">Images of the month</h2>${imagesHTML(d, pico.n)}`;
      const tech = WW.$("#vTechNisar", root);
      if (tech) {
        const c = r.area_coberta;
        tech.innerHTML = `<h3 class="v-h3">NISAR · ${MES_NOME}</h3>
          <table class="v-table v-table-tech"><thead><tr><th scope="col">Track</th><th scope="col">Orbit</th><th scope="col" class="num">Passes</th><th scope="col" class="num">Water min.</th><th scope="col" class="num">Water max.</th></tr></thead>
          <tbody>${r.por_trilha.map((t) => `<tr><td class="mono">${WW.esc(t.trilha)}</td><td>${orbitaNome(t.trilha)}</td><td class="num">${t.passagens}</td><td class="num">${WW.fmt(t.agua_min_km2, 1)} km²</td><td class="num">${WW.fmt(t.agua_max_km2, 1)} km²</td></tr>`).join("")}</tbody></table>
          <p class="v-foot-note">Dates: ${r.datas.map(dLong).join(", ")} · above normal ${WW.fmt(r.cheia_km2, 1)} km² · below normal ${WW.fmt(r.seca_km2, 1)} km² · covered area lat ${WW.fmt(c.sul, 2)} to ${WW.fmt(c.norte, 2)}, lon ${WW.fmt(c.oeste, 2)} to ${WW.fmt(c.leste, 2)} (EPSG:4326)</p>`;
      }
    }).catch((e) => {
      WW.$("#vMap", root).innerHTML = failed(e);
      WW.$("#vStatus", root).innerHTML = failed(e);
      WW.$("#vImages", root).innerHTML = "";
    });

    const previsaoP = api("/api/previsao");
    previsaoP.then((f) => {
      WW.$("#vForecast", root).innerHTML = `<div class="v-card-head"><h2 class="v-h2">Forecast · next 7 days</h2>${WW.sourceTag(f.origem, { previsao: true })}</div>${forecastHTML(f)}`;
      const tp = WW.$("#vTechPrev", root);
      if (tp) tp.innerHTML = `<h3 class="v-h3">Forecast · daily series</h3>
        <table class="v-table v-table-tech"><thead><tr><th scope="col">Day</th><th scope="col" class="num">Rain mm</th><th scope="col" class="num">Prob. %</th><th scope="col" class="num">Min. °C</th><th scope="col" class="num">Max. °C</th></tr></thead>
        <tbody>${f.dias.map((x) => `<tr><th scope="row">${dLong(x.data)}</th><td class="num">${WW.fmt(x.chuva_mm || 0, 1)}</td><td class="num">${x.prob_chuva ?? "—"}</td><td class="num">${WW.fmt(x.tmin, 1)}</td><td class="num">${WW.fmt(x.tmax, 1)}</td></tr>`).join("")}</tbody></table>
        <p class="v-foot-note">${WW.esc(f.fonte)} · lat ${f.lat}, lon ${f.lon} · generated at ${WW.esc(f.gerado_em)} (UTC)</p>`;
    }).catch((e) => {
      WW.$("#vForecast", root).innerHTML = `<h2 class="v-h2">Forecast · next 7 days</h2>${failed(e)}`;
    });

    /* ---------------- cenário simulado: chuva prevista + o que o radar viu em julho ---------------- */
    const cenEl = WW.$("#vCenario", root);
    Promise.all([loadBase(), previsaoP.catch(() => null)]).then(([d, f]) => {
      const u = WW.api.user();
      const cities = d.region.cities;
      const sede = cities.find((c) => c.name === (u && u.city)) || cities.find((c) => c.name === "Lajeado") || cities[0];
      const s = situacao(d, sede.lon, sede.lat);
      const temPrevisao = !!(f && f.dias.length);
      let modo = temPrevisao ? "agora" : "teste";
      const desenhar = () => {
        const chuva = modo === "agora" ? f.chuva_total_mm : WW.cenario.TESTE_MM;
        const c = WW.cenario({ chuva_mm: chuva, cidade: sede.name, dist_km: s.best ? s.best.km : null, data_julho: s.best ? s.best.data : null });
        const btn = (m, txt, off) => `<button type="button" class="sc-opt" data-modo="${m}" aria-pressed="${modo === m}"${off ? " disabled" : ""}>${txt}</button>`;
        cenEl.innerHTML = `
          <div class="v-card-head"><h2 class="v-h2" id="h-cen">Scenario · what if it rains like this?</h2><span class="src-tag src-demo"><span class="sr-only">Source: </span>Simulated</span></div>
          <div class="sc-toggle" role="group" aria-label="Rain used in the scenario">
            ${btn("agora", temPrevisao ? `Forecast rain · ${WW.fmt(f.chuva_total_mm, 0)} mm` : "Forecast rain · unavailable", !temPrevisao)}
            ${btn("teste", `Heavy test rain · ${WW.cenario.TESTE_MM} mm`)}
          </div>
          ${c.alerta ? `<div class="sc-alert" role="alert"><b>${WW.icon.pin.replace("<svg", '<svg width="14" height="14"')} ${WW.esc(c.alerta.titulo)}</b><span>${WW.esc(c.alerta.texto)}</span></div>` : ""}
          <div class="v-status-top">${levelBadge(c.nivel, c.label)}<span class="kicker">7 days · ${WW.esc(sede.name)}</span></div>
          <p class="v-frase">${WW.esc(c.frase)}</p>
          <h3 class="v-h3">What to do</h3>
          <ul class="sc-tips">${c.sugestoes.map((t) => `<li>${WW.esc(t)}</li>`).join("")}</ul>
          <p class="fc-note">${WW.esc(WW.cenario.AVISO)}</p>`;
      };
      cenEl.addEventListener("click", (e) => {
        const b = e.target.closest(".sc-opt");
        if (!b || b.disabled || b.dataset.modo === modo) return;
        modo = b.dataset.modo;
        desenhar();
        const foco = WW.$(`.sc-opt[data-modo="${modo}"]`, cenEl);
        if (foco) foco.focus();
      });
      desenhar();
    }).catch((e) => {
      cenEl.innerHTML = `<h2 class="v-h2">Scenario · what if it rains like this?</h2>${failed(e)}`;
    });

    /* ---------------- busca por cidade ou bairro ---------------- */
    const input = WW.$("#vSearch", root), list = WW.$("#vResults", root), place = WW.$("#vPlace", root);
    let timer = 0, seq = 0, items = [];
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        list.hidden = false; list.innerHTML = `<li class="v-res-note">Searching…</li>`;
        try {
          const r = await WW.api.get(`/api/lugares?q=${encodeURIComponent(q)}`, { cacheable: false });
          if (my !== seq) return;
          items = r.itens;
          list.innerHTML = items.length ? items.map((it, i) => `<li role="option" tabindex="-1" data-i="${i}"><b>${WW.esc(it.nome)}</b><span>${WW.esc(TIPO_LUGAR[it.tipo] || it.tipo)}${it.dentro_da_area_coberta ? "" : " · outside the radar area"}</span></li>`).join("")
            : `<li class="v-res-note">Nothing found for “${WW.esc(q)}”. The search covers the municipalities and neighbourhoods of the Vale do Taquari.</li>`;
          if (r.erro_bairros) list.insertAdjacentHTML("beforeend", `<li class="v-res-note">${WW.esc(r.erro_bairros)}</li>`);
        } catch (e) { if (my === seq) list.innerHTML = `<li class="v-res-note">${WW.esc(e.message)}</li>`; }
      }, 450);
    });
    input.addEventListener("keydown", (e) => {
      const opts = WW.$$('[role="option"]', list);
      if (e.key === "ArrowDown" && opts.length) { e.preventDefault(); opts[0].focus(); }
      if (e.key === "Escape") list.hidden = true;
    });
    list.addEventListener("keydown", (e) => {
      const opts = WW.$$('[role="option"]', list), i = opts.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (opts[i + 1] || opts[i]).focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (opts[i - 1] || input).focus(); }
      if (e.key === "Enter" && i >= 0) choose(+opts[i].dataset.i);
      if (e.key === "Escape") { list.hidden = true; input.focus(); }
    });
    list.addEventListener("click", (e) => { const li = e.target.closest('[role="option"]'); if (li) choose(+li.dataset.i); });

    function choose(i) {
      const it = items[i];
      if (!it) return;
      list.hidden = true; input.value = it.nome;
      mostrar(it);
    }

    let seqLugar = 0;
    function mostrar(it) {
      const my = ++seqLugar;
      // município: mede a partir da sede (lista de cidades da região), não do centro do polígono
      const sede = it.tipo === "município" && data ? data.region.cities.find((c) => c.name === it.nome) : null;
      const ponto = sede ? { lon: sede.lon, lat: sede.lat } : it;
      const dentro = it.dentro_da_area_coberta || !!sede;
      map.mark(ponto);
      let html = "";
      if (!dentro) {
        html = `${levelBadge("none", "Outside the scene")}<div>This place is outside the area covered by the NISAR scenes of this demo (the stretch between Muçum and Lajeado). We cannot tell how the water was there in ${MES_NOME}.</div>`;
      } else if (data) {
        const s = situacao(data, ponto.lon, ponto.lat);
        const ref = sede ? "the town centre" : "this point";
        const txt = s.best
          ? `In ${MES_NOME}, the nearest flooded spot was <b>${WW.fmt(s.best.km, 1)} km</b> from ${ref} (radar of ${dBR(s.best.data)}).`
          : `The radar saw no water above normal in ${MES_NOME}.`;
        html = `${levelBadge(s.nivel, s.label)}<div><b>${WW.esc(it.nome)}</b> · ${txt}</div>`;
      }
      const casa = lerCasa();
      const ehCasa = !!(casa && casa.nome === it.nome && casa.lat === it.lat && casa.lon === it.lon);
      place.hidden = false;
      place.innerHTML = `${ehCasa ? `<div class="kicker v-casa-k">${WW.icon.pin.replace("<svg", '<svg width="12" height="12"')} My home</div>` : ""}${html}
        ${dentro ? `<div class="v-hist" id="vHist">Counting the NISAR passes…</div>` : ""}
        <div class="v-place-actions"><button type="button" class="sc-opt" id="vCasaBtn" aria-pressed="${ehCasa}">${ehCasa ? "Forget my home" : "Save as my home"}</button></div>
        <small>Nearby = up to 1.5 km · may be affected = up to 3 km. Your home is saved only in this browser. Place source: ${WW.esc(it.fonte)}</small>`;
      WW.$("#vCasaBtn", place).addEventListener("click", () => {
        gravarCasa(ehCasa ? null : { nome: it.nome, tipo: it.tipo, lat: it.lat, lon: it.lon, dentro_da_area_coberta: it.dentro_da_area_coberta, fonte: it.fonte });
        mostrar(it);
        const b = WW.$("#vCasaBtn", place);
        if (b) b.focus();
      });
      if (!dentro) return;
      historicoNisar().then((h) => {
        const el = WW.$("#vHist", place);
        if (my !== seqLugar || !el) return;
        const c = contarPerto(h, ponto.lon, ponto.lat);
        el.innerHTML = c.k
          ? `In <b>${c.k} of the ${c.n}</b> NISAR passes (Jun to Oct 2026), the radar saw water above normal within 3 km of ${sede ? "the town centre" : "here"}: ${c.datas.map(dBR).join(", ")}.`
          : `In <b>none of the ${c.n}</b> NISAR passes (Jun to Oct 2026) did the radar see water above normal within 3 km of ${sede ? "the town centre" : "here"}.`;
      }).catch(() => {
        const el = WW.$("#vHist", place);
        if (el && my === seqLugar) el.remove();
      });
    }
  };

  /* ================================================== dados detalhados */
  WW.ValeDados = function (root) {
    root.innerHTML = `
      <div class="vale scroll">
        <header class="v-head">
          <div>
            <a class="v-back" href="#/vale">${WW.icon.back} Valley home</a>
            <h1>Detailed <em>data</em></h1>
          </div>
          <div class="v-head-chips"><span class="enso-slot" id="vEnso"></span><span class="chip">${WW.icon.pin.replace("<svg", '<svg width="13" height="13"')} ${LOCAL}</span><span class="chip">${MES_NOME}</span></div>
        </header>
        <nav class="v-dates" id="vDates" aria-label="Radar passes in July"></nav>
        <div class="v-data-grid">
          ${WW.mode.isDeep() ? `
          <section class="v-card v-span2 v-deep" aria-labelledby="h-deep">
            <div class="v-card-head"><h2 class="v-h2" id="h-deep">Technical panel · In-depth mode</h2>
              <div class="v-export" role="group" aria-label="Export data for research">
                <label class="sr-only" for="vExpFmt">Format</label>
                <select id="vExpFmt">
                  <option value="json">JSON · full package</option>
                  <option value="csv-passagens">CSV · passes (19)</option>
                  <option value="csv-poligonos">CSV · above/below-normal polygons (July)</option>
                </select>
                <button class="btn btn-primary" type="button" id="vExpBtn">${WW.icon.download} Export data</button>
              </div></div>
            <p class="v-lead">Data for study and academic use, with units, coordinate system and provenance. The export holds only public radar data and <b>no data from your account</b>.</p>
            <div id="vDeep">${loading()}</div>
            <p class="v-foot-note" id="vExpMsg" aria-live="polite"></p>
          </section>` : ""}
          <section class="v-card v-span2" aria-labelledby="h-change">
            <div class="v-card-head"><h2 class="v-h2" id="h-change">Change map</h2><span class="v-src" data-src></span>
              <div class="v-layers" role="group" aria-label="Map layers"><span>${WW.icon.layers} Layers</span>
                <label class="v-layer"><input type="checkbox" data-layer="radar" checked> Radar</label>
                <label class="v-layer"><input type="checkbox" data-layer="cheia" checked> Above normal</label>
                <label class="v-layer"><input type="checkbox" data-layer="seca" checked> Below normal</label>
                <label class="v-layer"><input type="checkbox" data-layer="muni" checked> Municipalities</label>
              </div></div>
            <div class="v-map v-map-tall" id="vChangeMap">${loading()}</div>
            <div class="v-map-foot">
              <div class="v-legend"><span><i class="lg-cheia"></i>Above normal: more water than usual</span><span><i class="lg-seca"></i>Below normal: less water than usual</span><span><i class="lg-cover"></i>Observed area</span></div>
              <span id="vChangeStamp">${stamp()}</span>
            </div>
          </section>

          <section class="v-card v-span2" aria-labelledby="h-cmp">
            <div class="v-card-head"><h2 class="v-h2" id="h-cmp">Compare before and after</h2><span class="v-src" data-src></span></div>
            <div id="vCompare">${loading()}</div>
          </section>

          <section class="v-card v-span2" aria-labelledby="h-tl">
            <div class="v-card-head"><h2 class="v-h2" id="h-tl">Timeline · NISAR passes</h2><span class="v-src" data-src></span></div>
            <div id="vTimeline">${loading()}</div>
          </section>

          <section class="v-card" aria-labelledby="h-area"><h2 class="v-h2" id="h-area">Flooded area</h2><div id="vArea">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-two"><h2 class="v-h2" id="h-two">Two ways to measure, two numbers</h2><div id="vTwo">${loading()}</div></section>

          <section class="v-card v-span2" aria-labelledby="h-muni"><h2 class="v-h2" id="h-muni">Flooded area by municipality</h2><div id="vMuni">${loading()}</div></section>

          <section class="v-card v-span2" aria-labelledby="h-rec"><div class="v-card-head"><h2 class="v-h2" id="h-rec">History · recurrent or one-off?</h2><span id="vRecSrc"></span></div><div id="vRec">${loading("Fetching the Sentinel-1 history…")}</div></section>

          <section class="v-card" aria-labelledby="h-veg"><h2 class="v-h2" id="h-veg">Flooded vegetation</h2><div id="vVeg">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-how"><h2 class="v-h2" id="h-how">How the map was made</h2><div id="vHow">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-dl"><h2 class="v-h2" id="h-dl">Download and export</h2><div id="vDl">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-meta"><h2 class="v-h2" id="h-meta">Metadata</h2><div id="vMeta">${loading()}</div></section>

          <section class="v-card v-span2" aria-labelledby="h-img"><h2 class="v-h2" id="h-img">Images</h2><div id="vImg">${loading()}</div></section>
        </div>
      </div>`;

    WW.EnsoBadge(WW.$("#vEnso", root));
    const map = ValeMap(WW.$("#vChangeMap", root));
    map.layer("radar", true);

    // geometry=false: só os números (~10 KB em vez de ~890 KB com as manchas, que o cartão não desenha)
    api("/api/regions/vale-do-taquari/recurrence?geometry=false").then((r) => {
      const recEl = WW.$("#vRec", root), recSrc = WW.$("#vRecSrc", root);
      if (!recEl || !recSrc) return; // the screen changed before the answer arrived
      recSrc.innerHTML = WW.sourceTag(r.source);
      recEl.innerHTML = recorrenciaHTML(r);
      desenharSerie(WW.$("#vRecChart", root), r.monthly);
    }).catch((e) => { const el = WW.$("#vRec", root); if (el) el.innerHTML = failed(e); });
    let data = null, sel = null, meta = null;

    WW.$$(".v-layers input", root).forEach((cb) => cb.addEventListener("change", () => map.layer(cb.dataset.layer, cb.checked)));

    function select(n) {
      sel = data.passagens.find((p) => p.n === n);
      WW.$$("#vDates button", root).forEach((b) => b.setAttribute("aria-pressed", +b.dataset.n === n));
      map.date(sel.data);
      WW.$("#vChangeStamp", root).innerHTML = stamp(`radar of ${dLong(sel.data)}`);
      const feats = data.change.features.filter((f) => f.properties.data === sel.data);
      WW.$("#vDl", root).innerHTML = `
        <ul class="v-dl">
          <li><a class="btn" href="${WW.api.url(`/api/nisar/passagens/${sel.n}/geojson?download=true`)}" download>${WW.icon.download} GeoJSON · ${dBR(sel.data)}</a><span>${feats.length} above/below-normal polygons of this pass</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/geojson?mes=${MES}&download=true`)}" download>${WW.icon.download} GeoJSON · all of July</a><span>all passes of ${MES_NOME}</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/exportar?formato=csv&mes=${MES}`)}" download>${WW.icon.download} Export CSV</a><span>one row per pass</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/exportar?formato=json&mes=${MES}`)}" download>${WW.icon.download} Export JSON</a><span>passes, municipalities and metadata</span></li>
          <li><a class="btn" href="${WW.api.url(sel.imagens.radar)}" download="radar_${sel.data}.png">${WW.icon.download} Radar image (PNG)</a><span>${dLong(sel.data)}</span></li>
        </ul>${stamp()}`;
      WW.$("#vImg", root).innerHTML = imagesHTML(data, sel.n) +
        `<figure class="v-fig v-fig-wide"><img src="${WW.api.url(sel.imagens.slide)}" data-radar-n="${sel.n}" data-radar-kind="slide" alt="Radar panel with above- and below-normal water marked on ${dLong(sel.data)}" loading="lazy">
          <figcaption><b>Radar with above/below-normal water · ${dLong(sel.data)}</b><span>${LOCAL} · processing image</span></figcaption></figure>`;
      if (meta) renderMeta();
      if (WW.mode.isDeep()) {
        renderDeepPolys();
        WW.$$(".v-table-tech tr[data-n]", root).forEach((tr) => tr.classList.toggle("is-sel", +tr.dataset.n === n));
      }
    }

    /* ---------------- modo Aprofundado: tabelas técnicas + exportação ---------------- */
    let todasPassagens = null;
    const munName = (lon, lat) => {
      const f = data.muni.features.find((m) => d3.geoContains(m, [lon, lat]));
      return f ? f.properties.name : null;
    };
    function polygonRows(feats) {
      return feats.map((f) => {
        const [lon, lat] = d3.geoCentroid(f);
        return { data: f.properties.data, trilha: f.properties.trilha, classe: f.properties.classe,
                 area_m2: Math.round(f.properties.area_km2 * 1e6), centroide_lat: +lat.toFixed(5), centroide_lon: +lon.toFixed(5), municipio: munName(lon, lat) };
      });
    }
    function renderDeep() {
      const box = WW.$("#vDeep", root);
      if (!box || !todasPassagens) return;
      const c = data.resumo.area_coberta;
      const [nw, se] = [[c.oeste, c.norte], [c.leste, c.sul]];
      const kmW = d3.geoDistance([c.oeste, (c.sul + c.norte) / 2], [c.leste, (c.sul + c.norte) / 2]) * 6371;
      const kmH = d3.geoDistance([c.oeste, c.sul], [c.oeste, c.norte]) * 6371;
      box.innerHTML = `
        <div class="v-deep-grid">
          <div>
            <h3 class="v-h3">Parameters</h3>
            <dl class="v-meta">
              <div><dt>Coordinate system</dt><dd>EPSG:4326 · WGS 84 (decimal degrees)</dd></div>
              <div><dt>Covered area</dt><dd>NW ${nw.map((v) => WW.fmt(v, 3)).join(", ")} · SE ${se.map((v) => WW.fmt(v, 3)).join(", ")} (${WW.fmt(kmW, 1)} × ${WW.fmt(kmH, 1)} km)</dd></div>
              <div><dt>Radar image (thumbnail)</dt><dd id="vPx">—</dd></div>
              <div><dt>Passes in the series</dt><dd>${todasPassagens.length} · ${data.resumo.por_trilha.map((t) => `${orbita(t.trilha)}: ${orbitaNome(t.trilha)}`).join(" · ")}</dd></div>
              <div><dt>Area by municipality</dt><dd>each polygon goes to the municipality that contains its centroid (IBGE mesh)</dd></div>
              <div><dt>API routes used</dt><dd class="mono">/api/regions/vale-do-taquari/passes · …/export?format=geojson&amp;month=${MES} · …/municipalities?month=${MES} · …/export?format=json</dd></div>
            </dl>
          </div>
          <div>
            <h3 class="v-h3">Polygons of the selected pass</h3>
            <div class="v-table-wrap v-scroll-y" id="vPolys"></div>
          </div>
        </div>
        <h3 class="v-h3">Full series by pass</h3>
        <div class="v-table-wrap"><table class="v-table v-table-tech">
          <thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Track</th><th scope="col">Pol.</th><th scope="col" class="num">Passes on orbit</th><th scope="col" class="num">Water km²</th><th scope="col" class="num">Above km²</th><th scope="col" class="num">Below km²</th><th scope="col">Window</th><th scope="col">Granule</th></tr></thead>
          <tbody>${todasPassagens.map((p) => `<tr data-n="${p.n}" class="${sel && p.n === sel.n ? "is-sel" : ""}">
            <td>${p.n}</td><th scope="row">${dLong(p.data)}</th><td class="mono">${WW.esc(p.trilha)}</td><td>${WW.esc(p.pol)}</td>
            <td class="num">${p.passagens_na_orbita}</td><td class="num">${WW.fmt(p.agua_km2, 1)}</td><td class="num ${p.cheia_km2 ? "has" : ""}">${WW.fmt(p.cheia_km2, 1)}</td><td class="num">${WW.fmt(p.seca_km2, 1)}</td>
            <td>${p.na_janela_da_enchente ? "yes" : "—"}</td><td class="mono">${WW.esc(p.granulo)}</td></tr>`).join("")}</tbody>
        </table></div>`;
      const probe = new Image();
      probe.onload = () => {
        const el = WW.$("#vPx", root);
        if (el) el.textContent = `${probe.naturalWidth} × ${probe.naturalHeight} px · ≈ ${WW.fmt((kmW * 1000) / probe.naturalWidth, 0)} m/px (display only, not the product resolution)`;
      };
      probe.src = WW.api.url(todasPassagens[0].imagens.radar);
      renderDeepPolys();
    }
    function renderDeepPolys() {
      const box = WW.$("#vPolys", root);
      if (!box || !sel) return;
      const rows = polygonRows(data.change.features.filter((f) => f.properties.data === sel.data));
      box.innerHTML = rows.length ? `<table class="v-table v-table-tech">
        <thead><tr><th scope="col">Class</th><th scope="col" class="num">Area m²</th><th scope="col" class="num">Lat</th><th scope="col" class="num">Lon</th><th scope="col">Municipality</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="${r.classe === "cheia" ? "has" : ""}">${r.classe === "cheia" ? "above normal" : "below normal"}</td><td class="num">${WW.fmt(r.area_m2)}</td><td class="num">${r.centroide_lat}</td><td class="num">${r.centroide_lon}</td><td>${WW.esc(r.municipio || "outside the mesh")}</td></tr>`).join("")}</tbody>
      </table><p class="v-foot-note">${rows.length} polygons · ${dLong(sel.data)}</p>`
        : `<p class="v-foot-note">No above- or below-normal polygon on ${dLong(sel.data)}.</p>`;
    }
    async function exportar() {
      const btn = WW.$("#vExpBtn", root), msg = WW.$("#vExpMsg", root), fmt = WW.$("#vExpFmt", root).value;
      btn.disabled = true; msg.textContent = "Montando o arquivo…";
      try {
        const [mun, metadados] = await Promise.all([api(`/api/nisar/municipios?mes=${MES}`), api("/api/nisar/metadados")]);
        const file = WW.exportData({
          mes: fmt === "csv-passagens" ? null : MES,
          passagens: todasPassagens,
          poligonos: polygonRows(data.change.features),
          municipios: mun.municipios,
          metadados,
        }, fmt);
        WW.downloadFile(file);
        msg.textContent = `File created: ${file.filename}. No data from your account.`;
      } catch (e) {
        msg.textContent = "Could not export: " + (e.message || e);
      } finally { btn.disabled = false; }
    }
    if (WW.mode.isDeep()) WW.$("#vExpBtn", root).addEventListener("click", exportar);

    function renderMeta() {
      const m = meta, c = m.area_coberta;
      WW.$("#vMeta", root).innerHTML = `<dl class="v-meta">
        <div><dt>Local</dt><dd>${WW.esc(m.local)}</dd></div>
        <div><dt>Month shown</dt><dd>${MES_NOME}</dd></div>
        <div><dt>Satellite</dt><dd>${WW.esc(m.satelite)}</dd></div>
        <div><dt>Produto</dt><dd>${WW.esc(m.produto)} · banda ${WW.esc(m.banda)} · ${m.polarizacao.join(", ")}</dd></div>
        <div><dt>Fonte</dt><dd>${WW.esc(m.fonte)}</dd></div>
        <div><dt>Covered area</dt><dd>lat ${WW.fmt(c.sul, 2)} to ${WW.fmt(c.norte, 2)} · lon ${WW.fmt(c.oeste, 2)} to ${WW.fmt(c.leste, 2)}</dd></div>
        <div><dt>Series</dt><dd>${m.periodo.passagens} passes, ${dLong(m.periodo.inicio)} to ${dLong(m.periodo.fim)}</dd></div>
        <div><dt>Orbits</dt><dd>${m.trilhas.map((t) => `${orbitaNome(t.trilha)} ${WW.esc(orbita(t.trilha))} (${t.passagens})`).join(" · ")}</dd></div>
        ${m.janela_da_enchente ? `<div><dt>Flood window</dt><dd>${dLong(m.janela_da_enchente.inicio)} to ${dLong(m.janela_da_enchente.fim)} <small>· ${WW.esc(m.janela_da_enchente.origem)}</small></dd></div>` : ""}
        ${sel ? `<div><dt>Granule (${dBR(sel.data)})</dt><dd class="mono">${WW.esc(sel.granulo)}</dd></div>` : ""}
      </dl>
      <ul class="v-cuidados">${m.cuidados.map((t) => `<li>${WW.esc(t)}</li>`).join("")}</ul>${stamp()}`;
    }

    /* ---------------- comparador antes × depois (mesma órbita) ---------------- */
    function renderCompare(todas) {
      const box = WW.$("#vCompare", root);
      const julho = todas.filter((p) => p.data.startsWith(MES));
      const pico = data.resumo.pico && julho.find((p) => p.data === data.resumo.pico.data);
      let depois = pico || julho[julho.length - 1];
      let antes = [...todas].reverse().find((p) => p.trilha === depois.trilha && p.data < depois.data) || todas[0];
      box.innerHTML = `
        <div class="v-compare-wrap">
          <div>
            <div class="v-compare-ctl">
              <label>Before<select id="cmpA"></select></label>
              <label>After<select id="cmpD"></select></label>
            </div>
            <div class="v-compare" id="cmpBox" style="--pos:50%">
              <img class="before" id="cmpImgA" data-radar-kind="radar" alt="">
              <img class="after" id="cmpImgD" data-radar-kind="radar" alt="">
              <span class="handle" aria-hidden="true"></span>
              <span class="tag l" id="cmpTagA"></span><span class="tag r" id="cmpTagD"></span>
              <input type="range" id="cmpRange" min="0" max="100" value="50" aria-label="Split between before and after" aria-valuetext="50% of the image shows the after">
            </div>
          </div>
          <div class="v-explain">
            <p>Both images are real satellite passes from the <b>same orbit</b>, so the comparison is fair. Smooth water looks dark to the radar; towns look bright.</p>
            <p id="cmpTxt"></p>
            <p class="v-keys">Slider keys: <kbd>←</kbd> <kbd>→</kbd> move 5% · <kbd>Home</kbd> shows only the before · <kbd>End</kbd> shows only the after.</p>
            ${stamp()}
          </div>
        </div>`;
      const selA = WW.$("#cmpA", box), selD = WW.$("#cmpD", box), range = WW.$("#cmpRange", box), cmp = WW.$("#cmpBox", box);
      const opt = (p, cur) => `<option value="${p.n}" ${p.n === cur.n ? "selected" : ""}>${dLong(p.data)} · ${orbitaNome(p.trilha)}</option>`;
      function fill() {
        selD.innerHTML = todas.map((p) => opt(p, depois)).join("");
        selA.innerHTML = todas.filter((p) => p.trilha === depois.trilha && p.data < depois.data).map((p) => opt(p, antes)).join("") || `<option>—</option>`;
        WW.$("#cmpImgA", box).src = WW.api.url(antes.imagens.radar); WW.$("#cmpImgA", box).alt = `Radar before, ${dLong(antes.data)}`;
        WW.$("#cmpImgD", box).src = WW.api.url(depois.imagens.radar); WW.$("#cmpImgD", box).alt = `Radar after, ${dLong(depois.data)}`;
        WW.$("#cmpImgA", box).dataset.radarN = antes.n; WW.$("#cmpImgD", box).dataset.radarN = depois.n;
        WW.$("#cmpTagA", box).textContent = "Before · " + dBR(antes.data);
        WW.$("#cmpTagD", box).textContent = "After · " + dBR(depois.data);
        const dif = depois.agua_km2 - antes.agua_km2;
        WW.$("#cmpTxt", box).innerHTML = `Water seen: <b>${km2(antes.agua_km2)}</b> on ${dBR(antes.data)} and <b>${km2(depois.agua_km2)}</b> on ${dBR(depois.data)} (${dif >= 0 ? "+" : ""}${WW.fmt(dif, 1)} km²). Water above normal on ${dBR(depois.data)}: <b>${km2(depois.cheia_km2)}</b>.`;
      }
      function setPos(v) {
        v = WW.clamp(v, 0, 100); range.value = v;
        cmp.style.setProperty("--pos", v + "%");
        range.setAttribute("aria-valuetext", `${100 - v}% of the image shows the after`);
      }
      selD.addEventListener("change", () => {
        depois = todas.find((p) => p.n === +selD.value);
        antes = [...todas].reverse().find((p) => p.trilha === depois.trilha && p.data < depois.data) || antes;
        fill();
      });
      selA.addEventListener("change", () => { antes = todas.find((p) => p.n === +selA.value) || antes; fill(); });
      range.addEventListener("input", () => setPos(+range.value));
      range.addEventListener("keydown", (e) => {
        const map = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 };
        if (e.key in map) { e.preventDefault(); setPos(+range.value + map[e.key]); }
        if (e.key === "Home") { e.preventDefault(); setPos(100); }
        if (e.key === "End") { e.preventDefault(); setPos(0); }
      });
      fill(); setPos(50);
    }

    /* ---------------- linha do tempo das 19 passagens ---------------- */
    function renderTimeline(todas) {
      const box = WW.$("#vTimeline", root);
      const max = Math.max(...todas.map((p) => p.agua_km2));
      const orbs = [...new Set(todas.map((p) => p.trilha))];
      let i = todas.findIndex((p) => p.data === (data.resumo.pico ? data.resumo.pico.data : todas[0].data));
      if (i < 0) i = 0;
      let timer = 0;
      box.innerHTML = `
        <p class="v-lead">${todas.length} valid passes · from ${dLong(todas[0].data)} to ${dLong(todas[todas.length - 1].data)}. NISAR repeats each orbit every 12 days; with the ascending and descending passes together it looks at the valley every few days. The highlighted band is the flood window.</p>
        <div class="v-tl-bars" id="tlBars" role="group" aria-label="Water per pass">${todas.map((p, k) => `
          <button type="button" class="o${orbs.indexOf(p.trilha)} ${p.na_janela_da_enchente ? "flood" : ""}" data-k="${k}" aria-pressed="false"
            title="${dLong(p.data)}, ${orbitaNome(p.trilha)} orbit, ${WW.fmt(p.agua_km2, 1)} km² of water${p.cheia_km2 ? `, ${WW.fmt(p.cheia_km2, 1)} km² above normal` : ""}">
            ${p.cheia_km2 ? '<span class="cheia-dot"></span>' : ""}<span class="b" style="height:${(p.agua_km2 / max) * 100}%"></span>
            <span class="sr-only">${dLong(p.data)}</span></button>`).join("")}
        </div>
        <div class="v-tl-axis"><span>${dBR(todas[0].data)}</span><span>${dBR(todas[Math.floor(todas.length / 2)].data)}</span><span>${dBR(todas[todas.length - 1].data)}</span></div>
        <div class="v-legend" style="margin-top:8px"><span><i style="background:var(--water)"></i>${orbitaNome(orbs[0])} orbit</span>${orbs[1] ? `<span><i style="background:var(--terrain)"></i>${orbitaNome(orbs[1])} orbit</span>` : ""}<span><i class="lg-cheia" style="border-radius:50%;width:8px;height:8px"></i>Had water above normal</span></div>
        <div class="v-tl-ctl">
          <button class="btn btn-icon" type="button" id="tlPrev" aria-label="Previous pass">${WW.icon.prev}</button>
          <button class="btn btn-icon btn-primary" type="button" id="tlPlay" aria-label="Play the ${todas.length} passes">${WW.icon.play}</button>
          <button class="btn btn-icon" type="button" id="tlNext" aria-label="Next pass">${WW.icon.next}</button>
          <span class="v-tl-now" id="tlNow" aria-live="polite"></span>
        </div>
        <div class="v-tl-body">
          <figure class="v-fig"><img id="tlImg" data-radar-kind="radar" alt=""><figcaption><b id="tlCap"></b><span>${LOCAL}</span></figcaption></figure>
          <div class="v-explain">
            <p><b>How to read the timeline:</b> each bar is a satellite pass, with the water the radar saw that day. Bars of the same colour are from the same orbit and can be compared. Between orbits the number changes because of the viewing angle, not because the river rose.</p>
            <p id="tlTxt"></p>
            ${stamp("full series, Jun to Oct 2026")}
          </div>
        </div>`;
      const bars = WW.$$("#tlBars button", box);
      // pré-carrega as imagens para a reprodução não piscar
      todas.forEach((p) => { const im = new Image(); im.src = WW.api.url(p.imagens.radar); });
      function show(k) {
        i = (k + todas.length) % todas.length;
        const p = todas[i];
        bars.forEach((b, j) => b.setAttribute("aria-pressed", j === i));
        WW.$("#tlImg", box).src = WW.api.url(p.imagens.radar);
        WW.$("#tlImg", box).dataset.radarN = p.n;
        WW.$("#tlImg", box).alt = `NISAR radar of ${dLong(p.data)}`;
        WW.$("#tlCap", box).textContent = `Radar · ${dLong(p.data)}`;
        WW.$("#tlNow", box).innerHTML = `<b>${i + 1}/${todas.length}</b> · ${dLong(p.data)} · ${orbitaNome(p.trilha)} orbit`;
        WW.$("#tlTxt", box).innerHTML = `${dLong(p.data)}, ${orbitaNome(p.trilha)} orbit (${orbita(p.trilha)}): <b>${km2(p.agua_km2)}</b> of water seen. Above normal: <b>${km2(p.cheia_km2)}</b>. Below normal: <b>${km2(p.seca_km2)}</b>.${p.na_janela_da_enchente ? " Inside the flood window." : ""}`;
      }
      function stop() { clearInterval(timer); timer = 0; const b = WW.$("#tlPlay", box); b.innerHTML = WW.icon.play; b.setAttribute("aria-label", `Play the ${todas.length} passes`); }
      bars.forEach((b) => b.addEventListener("click", () => { stop(); show(+b.dataset.k); }));
      WW.$("#tlPrev", box).addEventListener("click", () => { stop(); show(i - 1); });
      WW.$("#tlNext", box).addEventListener("click", () => { stop(); show(i + 1); });
      WW.$("#tlPlay", box).addEventListener("click", (e) => {
        if (timer) return stop();
        e.currentTarget.innerHTML = WW.icon.pause; e.currentTarget.setAttribute("aria-label", "Pause");
        if (i === todas.length - 1) show(0);
        timer = setInterval(() => { if (i >= todas.length - 1) stop(); else show(i + 1); }, WW.reducedMotion() ? 2200 : 1100);
      });
      show(i);
    }

    loadBase().then((d) => {
      data = d;
      map.set(d);
      WW.$$("[data-src]", root).forEach((el) => { el.innerHTML = WW.sourceTag(d.origem); });
      const r = d.resumo;
      WW.$("#vDates", root).innerHTML = d.passagens.map((p) => `<button type="button" data-n="${p.n}" aria-pressed="false">
        <b>${dBR(p.data)}</b><span>${orbitaNome(p.trilha)} orbit${p.cheia_km2 ? " · above normal" : ""}</span></button>`).join("");
      WW.$("#vDates", root).addEventListener("click", (e) => { const b = e.target.closest("button[data-n]"); if (b) select(+b.dataset.n); });

      const tracks = r.por_trilha.map((t) => t.trilha);
      const max = Math.max(...d.passagens.map((p) => p.agua_km2));
      WW.$("#vArea", root).innerHTML = `
        <p class="v-lead">Water seen by the radar in each July pass, by orbit. ${WW.esc(r.aviso)}</p>
        <ul class="v-hbars">${d.passagens.map((p) => `<li>
          <span class="hb-l">${dBR(p.data)} <small>${orbitaNome(p.trilha)}</small></span>
          <span class="hb-t"><span class="hb-f t${tracks.indexOf(p.trilha)}" style="width:${(p.agua_km2 / max) * 100}%"></span></span>
          <span class="hb-v">${km2(p.agua_km2)}</span></li>`).join("")}</ul>
        <dl class="v-nums v-nums-sm">
          <div><dt>Above normal in the month</dt><dd>${km2(r.cheia_km2)}</dd></div>
          <div><dt>Below normal in the month</dt><dd>${km2(r.seca_km2)}</dd></div>
        </dl>${stamp()}`;

      WW.$("#vTwo", root).innerHTML = `
        <dl class="v-two">
          <div><dt>Water seen in each pass</dt><dd>${r.por_trilha.map((t) => `${WW.fmt(t.agua_min_km2, 1)}–${WW.fmt(t.agua_max_km2, 1)}`).join(" / ")} km²</dd>
            <p>All the surface the radar saw as water: the river and anything else flooded. It depends on the orbit (${r.por_trilha.map((t) => orbitaNome(t.trilha)).join(" / ")}).</p></div>
          <div><dt>Water above normal in the month</dt><dd>${km2(r.cheia_km2)}</dd>
            <p>Only what appeared beyond normal for that time of year${r.pico ? `, almost all of it on ${dBR(r.pico.data)}` : ""}.</p></div>
        </dl>
        <p class="v-foot-note">Both are right; they answer different questions: “how much water is there?” and “how much of it is above normal?”.</p>${stamp()}`;

      const first = (r.pico && d.passagens.find((p) => p.data === r.pico.data)) || d.passagens[0];
      select(first.n);
      return api("/api/nisar/passagens").then((all) => {
        todasPassagens = all.itens;
        renderCompare(all.itens); renderTimeline(all.itens);
        if (WW.mode.isDeep()) renderDeep();
      });
    }).catch((e) => {
      ["#vChangeMap", "#vArea", "#vCompare", "#vTimeline", "#vTwo"].forEach((s) => { WW.$(s, root).innerHTML = failed(e); });
    });

    api(`/api/nisar/municipios?mes=${MES}`).then((m) => {
      const all = m.municipios.filter((x) => x.toca_area_coberta);
      const rows = all.filter((x) => x.cheia_km2 || x.seca_km2);
      const zero = all.filter((x) => !x.cheia_km2 && !x.seca_km2);
      const max = Math.max(0.001, ...rows.map((x) => x.cheia_km2));
      WW.$("#vMuni", root).innerHTML = `
        <p class="v-lead">${WW.esc(m.metodo)}</p>
        <div class="v-table-wrap"><table class="v-table">
          <thead><tr><th scope="col">Municipality</th>${m.datas.map((dt) => `<th scope="col" class="num">${dBR(dt)}</th>`).join("")}<th scope="col" class="num">Above in the month</th><th scope="col" class="num">Below in the month</th></tr></thead>
          <tbody>${rows.map((x) => `<tr>
            <th scope="row">${WW.esc(x.nome)}</th>
            ${x.por_data.map((pd) => `<td class="num ${pd.cheia_km2 ? "has" : ""}">${pd.cheia_km2 ? WW.fmt(pd.cheia_km2 * 100, 1) + " ha" : "·"}</td>`).join("")}
            <td class="num"><span class="cell-bar" style="--w:${(x.cheia_km2 / max) * 100}%"></span>${WW.fmt(x.cheia_km2 * 100, 1)} ha</td>
            <td class="num">${WW.fmt(x.seca_km2 * 100, 1)} ha</td></tr>`).join("")}</tbody>
        </table></div>
        ${zero.length ? `<details class="v-more"><summary>${zero.length} more municipalities in the observed area with no water above or below normal in ${MES_NOME}</summary><p>${zero.map((x) => WW.esc(x.nome)).join(" · ")}</p></details>` : ""}
        <p class="v-foot-note">Values in hectares (1 ha = 0.01 km²). Only municipalities that touch the area observed by the radar.</p>${stamp()}`;
    }).catch((e) => { WW.$("#vMuni", root).innerHTML = failed(e); });

    api("/api/nisar/metadados").then((m) => {
      meta = m; renderMeta();
      const v = m.vegetacao_alagada;
      WW.$("#vVeg", root).innerHTML = `<div class="v-unavailable">
        <span class="chip">No data yet</span>
        <p>${WW.esc(v.motivo)}</p>
        <p class="v-foot-note"><b>What is missing:</b> ${WW.esc(v.requer)}</p>
      </div>${stamp()}`;
      WW.$("#vHow", root).innerHTML = `<div class="v-explain">
        <p>The NISAR radar (L-band, ${m.polarizacao.join("/")} polarisation) sends microwaves and measures what comes back. <b>Smooth water reflects the signal away and looks dark</b>; towns and forest send more signal back and look bright. That is why the radar sees by day, by night and through clouds.</p>
        <p>Each pass was compared with what is normal for that time of year. Where extra water appeared, the pixel became <b>above normal</b>; where water was missing, <b>below normal</b>.</p>
        <div class="v-classes">${Object.entries(m.classes).map(([k, t]) => `<span class="chip"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--data-${k})"></i>${WW.esc(k)}: ${WW.esc(t)}</span>`).join("")}</div>
        <p><b>Limits:</b> shallow water with wind or tall vegetation may not be seen as open water; dense urban areas cause double-bounce and can hide water between buildings; radar shadow behind hills also looks dark. Not seeing water does not prove there was no flood.</p>
      </div>${stamp()}`;
    }).catch((e) => { WW.$("#vMeta", root).innerHTML = failed(e); WW.$("#vVeg", root).innerHTML = failed(e); WW.$("#vHow", root).innerHTML = failed(e); });
  };
})(window.WW);
