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
  const MES_NOME = "julho de 2026";
  const STAMP = `${LOCAL} · ${MES_NOME}`;
  const api = (p) => WW.api.get(p);
  const km2 = (v, d = 1) => (v == null ? "—" : WW.fmt(v, d) + " km²");
  const dBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const dLong = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const orbita = (t) => t.split("_").slice(0, 2).join("_");
  const orbitaNome = (t) => (t.includes("_A_") ? "ascendente" : "descendente");
  const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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
    if (!best) return { nivel: "ok", label: "Sem água nova perto", best };
    if (best.km <= 1.5) return { nivel: "alert", label: "Água nova perto", best };
    if (best.km <= 3) return { nivel: "warn", label: "Pode ser afetada", best };
    return { nivel: "ok", label: "Sem água nova perto", best };
  }

  /* ------------------------------------------------ mapa simplificado (SVG) */
  function ValeMap(el, { compact = false } = {}) {
    el.innerHTML = `<svg class="vmap" role="img" aria-label="Mapa simplificado do ${LOCAL}"></svg>`;
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
      svg.append("text").attr("class", "vm-cover-label").attr("x", lx + 8).attr("y", ly + 18).text("Área observada pelo radar");

      // traçado simplificado do rio; com o radar visível o próprio leito aparece na imagem
      const river = data.region.river;
      if (river && show.rio && !show.radar) svg.append("path").attr("class", "vm-river").attr("d", path({ type: "LineString", coordinates: river.coordinates }));

      const feats = data.change.features.filter((f) => (!selectedDate || f.properties.data === selectedDate) && show[f.properties.classe]);
      const g = svg.append("g").attr("class", "vm-change");
      g.selectAll("path").data(feats).join("path").attr("class", (f) => "vm-" + f.properties.classe).attr("d", path);
      g.selectAll("circle").data(feats).join("circle").attr("class", (f) => "vm-ring vm-" + f.properties.classe)
        .attr("r", compact ? 5 : 7).attr("cx", (f) => path.centroid(f)[0]).attr("cy", (f) => path.centroid(f)[1])
        .append("title").text((f) => `${f.properties.classe === "cheia" ? "Água fora do normal" : "Falta de água"} · ${dBR(f.properties.data)} · ${WW.fmt(f.properties.area_km2 * 1e6, 0)} m²`);

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
  const loading = (txt = "Carregando dados do servidor…") => `<div class="v-state">${txt}</div>`;
  const failed = (e) => `<div class="v-state v-error"><b>Não foi possível carregar.</b><br>${WW.esc(e.message || e)}<br>
    <small>Confira se a API está rodando em ${WW.esc(WW.api.base)} (veja mockup/README.md).</small></div>`;
  const levelBadge = (cls, label) => `<span class="v-level v-level-${cls}"><span class="dot"></span>${WW.esc(label)}</span>`;

  function forecastHTML(f) {
    const max = Math.max(10, ...f.dias.map((d) => d.chuva_mm || 0));
    const bars = f.dias.map((d) => {
      const dt = new Date(d.data + "T12:00:00");
      const h = Math.round(((d.chuva_mm || 0) / max) * 64);
      return `<li title="${dLong(d.data)}: ${WW.fmt(d.chuva_mm || 0, 1)} mm, ${d.prob_chuva ?? "—"}% de chance">
        <span class="fc-mm">${WW.fmt(d.chuva_mm || 0, 0)}</span>
        <span class="fc-bar" style="height:${Math.max(h, 2)}px"></span>
        <span class="fc-day">${WEEK[dt.getDay()]}<br><small>${dBR(d.data)}</small></span>
      </li>`;
    }).join("");
    const hora = new Date(f.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `<p class="fc-frase">${WW.esc(f.frase)}</p><ul class="fc-bars" aria-label="Chuva prevista por dia (mm)">${bars}</ul>
      <p class="fc-note">Chuva em mm por dia · ${WW.esc(f.fonte)} · atualizado às ${hora}. É a previsão do tempo, não uma previsão de enchente, e não substitui os alertas da Defesa Civil.</p>`;
  }

  function imagesHTML(d, n) {
    const p = d.passagens.find((x) => x.n === n) || d.passagens[0];
    return `<div class="v-images">
      <figure class="v-fig"><img src="assets/img/vale-ilustrado.webp" alt="Ilustração do Vale do Taquari com o rio e as cidades">
        <figcaption><b>Ilustração</b><span>${STAMP}</span></figcaption></figure>
      <figure class="v-fig"><img src="${WW.api.url(p.imagens.radar)}" data-radar-n="${p.n}" data-radar-kind="radar" alt="Imagem de radar NISAR de ${dLong(p.data)} sobre o Vale do Taquari. Água aparece escura; cidades, claras." loading="lazy">
        <figcaption><b>Radar NISAR · ${dLong(p.data)}</b><span>${LOCAL} · órbita ${orbitaNome(p.trilha)} (${orbita(p.trilha)})</span></figcaption></figure>
    </div>`;
  }

  const LEVEL = { normal: ["ok", "Sem alagamento"], atencao: ["warn", "Atenção"], alagamento: ["alert", "Alagamento"], sem_dados: ["none", "Sem dados"] };

  /* ================================================== tela inicial */
  WW.ValeHome = function (root) {
    root.innerHTML = `
      <div class="vale scroll">
        <header class="v-head">
          <div>
            <div class="kicker">${WW.icon.pin.replace("<svg", '<svg width="14" height="14"')} ${LOCAL}</div>
            <h1>Como está a <em>água</em> no vale</h1>
          </div>
          <div class="v-head-chips"><span class="enso-slot" id="vEnso"></span><span class="chip">${MES_NOME}</span><span class="chip chip-water"><span class="dot live"></span>Radar NISAR · banda L</span><a class="btn btn-primary v-head-cta" href="#/vale/dados">Dados detalhados ${WW.icon.chevron}</a></div>
        </header>
        <div class="v-home-grid">
          <section class="v-card v-map-card" aria-label="Mapa do vale">
            <div class="v-search" role="search">
              ${WW.icon.search}
              <input id="vSearch" type="search" placeholder="Buscar cidade ou bairro…" autocomplete="off" aria-label="Buscar cidade ou bairro" aria-controls="vResults">
              <ul class="v-results" id="vResults" role="listbox" hidden></ul>
            </div>
            <div class="v-map" id="vMap">${loading()}</div>
            <div class="v-map-foot">
              <div class="v-legend"><span><i class="lg-river"></i>Rio Taquari</span><span><i class="lg-cover"></i>Área observada</span><span><i class="lg-cheia"></i>Água fora do normal</span></div>
              ${stamp()}
            </div>
            <div class="v-place" id="vPlace" aria-live="polite" hidden></div>
          </section>

          <aside class="v-side">
            <section class="v-card v-status" id="vStatus">${loading()}</section>
            <section class="v-card v-forecast" id="vForecast"><h2 class="v-h2">Previsão · próximos 7 dias</h2>${loading("Buscando previsão…")}</section>
            <a class="btn btn-primary v-cta" href="#/vale/dados">Ver dados detalhados ${WW.icon.chevron}</a>
          </aside>
        </div>
        <section class="v-card" id="vImages" aria-label="Imagens"><h2 class="v-h2">Imagens do mês</h2>${loading()}</section>
        ${WW.mode.isDeep() ? `<section class="v-card v-deep" id="vTech" aria-labelledby="h-tech" style="margin-top:var(--s4)">
          <div class="v-card-head"><h2 class="v-h2" id="h-tech">Dados técnicos · modo Aprofundado</h2><a class="btn" href="#/vale/dados">${WW.icon.download} Exportar no painel de dados</a></div>
          <div class="v-deep-grid"><div id="vTechNisar">${loading()}</div><div id="vTechPrev">${loading("Buscando previsão…")}</div></div>
        </section>` : ""}
      </div>`;

    WW.EnsoBadge(WW.$("#vEnso", root));
    const map = ValeMap(WW.$("#vMap", root), { compact: true });
    let data = null;

    loadBase().then((d) => {
      data = d;
      map.set(d);
      const r = d.resumo, [cls, lbl] = LEVEL[r.nivel] || LEVEL.sem_dados;
      WW.$("#vStatus", root).innerHTML = `
        <div class="v-status-top">${levelBadge(cls, lbl)}<span class="kicker">${MES_NOME}</span></div>
        <p class="v-frase">${WW.esc(r.frase)}</p>
        <dl class="v-nums">
          <div><dt>Passagens do radar</dt><dd>${r.passagens}</dd></div>
          <div><dt>Água fora do normal</dt><dd>${km2(r.cheia_km2)}</dd></div>
          <div><dt>Falta de água</dt><dd>${km2(r.seca_km2)}</dd></div>
        </dl>
        ${stamp("trecho Muçum–Lajeado")}`;
      const pico = r.pico ? d.passagens.find((p) => p.data === r.pico.data) : d.passagens[d.passagens.length - 1];
      WW.$("#vImages", root).innerHTML = `<h2 class="v-h2">Imagens do mês</h2>${imagesHTML(d, pico.n)}`;
      const tech = WW.$("#vTechNisar", root);
      if (tech) {
        const c = r.area_coberta;
        tech.innerHTML = `<h3 class="v-h3">NISAR · ${MES_NOME}</h3>
          <table class="v-table v-table-tech"><thead><tr><th scope="col">Trilha</th><th scope="col">Órbita</th><th scope="col" class="num">Passagens</th><th scope="col" class="num">Água mín.</th><th scope="col" class="num">Água máx.</th></tr></thead>
          <tbody>${r.por_trilha.map((t) => `<tr><td class="mono">${WW.esc(t.trilha)}</td><td>${orbitaNome(t.trilha)}</td><td class="num">${t.passagens}</td><td class="num">${WW.fmt(t.agua_min_km2, 1)} km²</td><td class="num">${WW.fmt(t.agua_max_km2, 1)} km²</td></tr>`).join("")}</tbody></table>
          <p class="v-foot-note">Datas: ${r.datas.map(dLong).join(", ")} · cheia ${WW.fmt(r.cheia_km2, 1)} km² · seca ${WW.fmt(r.seca_km2, 1)} km² · área coberta lat ${WW.fmt(c.sul, 2)} a ${WW.fmt(c.norte, 2)}, lon ${WW.fmt(c.oeste, 2)} a ${WW.fmt(c.leste, 2)} (EPSG:4326)</p>`;
      }
    }).catch((e) => {
      WW.$("#vMap", root).innerHTML = failed(e);
      WW.$("#vStatus", root).innerHTML = failed(e);
      WW.$("#vImages", root).innerHTML = "";
    });

    api("/api/previsao").then((f) => {
      WW.$("#vForecast", root).innerHTML = `<div class="v-card-head"><h2 class="v-h2">Previsão · próximos 7 dias</h2>${WW.sourceTag(f.origem, { previsao: true })}</div>${forecastHTML(f)}`;
      const tp = WW.$("#vTechPrev", root);
      if (tp) tp.innerHTML = `<h3 class="v-h3">Previsão · série diária</h3>
        <table class="v-table v-table-tech"><thead><tr><th scope="col">Dia</th><th scope="col" class="num">Chuva mm</th><th scope="col" class="num">Prob. %</th><th scope="col" class="num">Mín. °C</th><th scope="col" class="num">Máx. °C</th></tr></thead>
        <tbody>${f.dias.map((x) => `<tr><th scope="row">${dLong(x.data)}</th><td class="num">${WW.fmt(x.chuva_mm || 0, 1)}</td><td class="num">${x.prob_chuva ?? "—"}</td><td class="num">${WW.fmt(x.tmin, 1)}</td><td class="num">${WW.fmt(x.tmax, 1)}</td></tr>`).join("")}</tbody></table>
        <p class="v-foot-note">${WW.esc(f.fonte)} · lat ${f.lat}, lon ${f.lon} · gerado em ${WW.esc(f.gerado_em)} (UTC)</p>`;
    }).catch((e) => {
      WW.$("#vForecast", root).innerHTML = `<h2 class="v-h2">Previsão · próximos 7 dias</h2>${failed(e)}`;
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
        list.hidden = false; list.innerHTML = `<li class="v-res-note">Buscando…</li>`;
        try {
          const r = await WW.api.get(`/api/lugares?q=${encodeURIComponent(q)}`, { cacheable: false });
          if (my !== seq) return;
          items = r.itens;
          list.innerHTML = items.length ? items.map((it, i) => `<li role="option" tabindex="-1" data-i="${i}"><b>${WW.esc(it.nome)}</b><span>${WW.esc(it.tipo)}${it.dentro_da_area_coberta ? "" : " · fora da área do radar"}</span></li>`).join("")
            : `<li class="v-res-note">Nada encontrado para “${WW.esc(q)}”. A busca cobre os municípios e bairros do Vale do Taquari.</li>`;
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
      // município: mede a partir da sede (lista de cidades da região), não do centro do polígono
      const sede = it.tipo === "município" && data ? data.region.cities.find((c) => c.name === it.nome) : null;
      const ponto = sede ? { lon: sede.lon, lat: sede.lat } : it;
      map.mark(ponto);
      let html;
      if (!it.dentro_da_area_coberta && !sede) {
        html = `${levelBadge("none", "Fora da cena")}<div>Este lugar fica fora da área coberta pelas cenas NISAR desta demonstração (trecho entre Muçum e Lajeado). Não dá para dizer como a água ficou aí em ${MES_NOME}.</div>`;
      } else if (data) {
        const s = situacao(data, ponto.lon, ponto.lat);
        const ref = sede ? "da sede" : "deste ponto";
        const txt = s.best
          ? `Em ${MES_NOME}, o ponto alagado mais próximo ${ref} ficou a <b>${WW.fmt(s.best.km, 1)} km</b> (radar de ${dBR(s.best.data)}).`
          : `O radar não viu água fora do normal em ${MES_NOME}.`;
        html = `${levelBadge(s.nivel, s.label)}<div><b>${WW.esc(it.nome)}</b> · ${txt}</div>`;
      }
      place.hidden = false;
      place.innerHTML = `${html}<small>Perto = até 1,5 km · pode ser afetada = até 3 km. Fonte do local: ${WW.esc(it.fonte)}</small>`;
    }
  };

  /* ================================================== dados detalhados */
  WW.ValeDados = function (root) {
    root.innerHTML = `
      <div class="vale scroll">
        <header class="v-head">
          <div>
            <a class="v-back" href="#/vale">${WW.icon.back} Início do vale</a>
            <h1>Dados <em>detalhados</em></h1>
          </div>
          <div class="v-head-chips"><span class="enso-slot" id="vEnso"></span><span class="chip">${WW.icon.pin.replace("<svg", '<svg width="13" height="13"')} ${LOCAL}</span><span class="chip">${MES_NOME}</span></div>
        </header>
        <nav class="v-dates" id="vDates" aria-label="Passagens do radar em julho"></nav>
        <div class="v-data-grid">
          ${WW.mode.isDeep() ? `
          <section class="v-card v-span2 v-deep" aria-labelledby="h-deep">
            <div class="v-card-head"><h2 class="v-h2" id="h-deep">Painel técnico · modo Aprofundado</h2>
              <div class="v-export" role="group" aria-label="Exportar dados para pesquisa">
                <label class="sr-only" for="vExpFmt">Formato</label>
                <select id="vExpFmt">
                  <option value="json">JSON · pacote completo</option>
                  <option value="csv-passagens">CSV · passagens (19)</option>
                  <option value="csv-poligonos">CSV · polígonos de cheia/seca (julho)</option>
                </select>
                <button class="btn btn-primary" type="button" id="vExpBtn">${WW.icon.download} Exportar dados</button>
              </div></div>
            <p class="v-lead">Dados para estudo e uso acadêmico, com unidades, sistema de coordenadas e origem. A exportação traz só dados públicos do radar e <b>nenhum dado da sua conta</b>.</p>
            <div id="vDeep">${loading()}</div>
            <p class="v-foot-note" id="vExpMsg" aria-live="polite"></p>
          </section>` : ""}
          <section class="v-card v-span2" aria-labelledby="h-change">
            <div class="v-card-head"><h2 class="v-h2" id="h-change">Mapa de mudança</h2><span class="v-src" data-src></span>
              <div class="v-layers" role="group" aria-label="Camadas do mapa"><span>${WW.icon.layers} Camadas</span>
                <label class="v-layer"><input type="checkbox" data-layer="radar" checked> Radar</label>
                <label class="v-layer"><input type="checkbox" data-layer="cheia" checked> Cheia</label>
                <label class="v-layer"><input type="checkbox" data-layer="seca" checked> Seca</label>
                <label class="v-layer"><input type="checkbox" data-layer="muni" checked> Municípios</label>
              </div></div>
            <div class="v-map v-map-tall" id="vChangeMap">${loading()}</div>
            <div class="v-map-foot">
              <div class="v-legend"><span><i class="lg-cheia"></i>Cheia: água fora do normal</span><span><i class="lg-seca"></i>Seca: falta de água</span><span><i class="lg-cover"></i>Área observada</span></div>
              <span id="vChangeStamp">${stamp()}</span>
            </div>
          </section>

          <section class="v-card v-span2" aria-labelledby="h-cmp">
            <div class="v-card-head"><h2 class="v-h2" id="h-cmp">Comparar antes e depois</h2><span class="v-src" data-src></span></div>
            <div id="vCompare">${loading()}</div>
          </section>

          <section class="v-card v-span2" aria-labelledby="h-tl">
            <div class="v-card-head"><h2 class="v-h2" id="h-tl">Linha do tempo · passagens do NISAR</h2><span class="v-src" data-src></span></div>
            <div id="vTimeline">${loading()}</div>
          </section>

          <section class="v-card" aria-labelledby="h-area"><h2 class="v-h2" id="h-area">Área alagada</h2><div id="vArea">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-two"><h2 class="v-h2" id="h-two">Dois jeitos de medir, dois números</h2><div id="vTwo">${loading()}</div></section>

          <section class="v-card v-span2" aria-labelledby="h-muni"><h2 class="v-h2" id="h-muni">Área alagada por município</h2><div id="vMuni">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-veg"><h2 class="v-h2" id="h-veg">Vegetação alagada</h2><div id="vVeg">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-how"><h2 class="v-h2" id="h-how">Como o mapa foi feito</h2><div id="vHow">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-dl"><h2 class="v-h2" id="h-dl">Baixar e exportar</h2><div id="vDl">${loading()}</div></section>

          <section class="v-card" aria-labelledby="h-meta"><h2 class="v-h2" id="h-meta">Metadados</h2><div id="vMeta">${loading()}</div></section>

          <section class="v-card v-span2" aria-labelledby="h-img"><h2 class="v-h2" id="h-img">Imagens</h2><div id="vImg">${loading()}</div></section>
        </div>
      </div>`;

    WW.EnsoBadge(WW.$("#vEnso", root));
    const map = ValeMap(WW.$("#vChangeMap", root));
    map.layer("radar", true);
    let data = null, sel = null, meta = null;

    WW.$$(".v-layers input", root).forEach((cb) => cb.addEventListener("change", () => map.layer(cb.dataset.layer, cb.checked)));

    function select(n) {
      sel = data.passagens.find((p) => p.n === n);
      WW.$$("#vDates button", root).forEach((b) => b.setAttribute("aria-pressed", +b.dataset.n === n));
      map.date(sel.data);
      WW.$("#vChangeStamp", root).innerHTML = stamp(`radar de ${dLong(sel.data)}`);
      const feats = data.change.features.filter((f) => f.properties.data === sel.data);
      WW.$("#vDl", root).innerHTML = `
        <ul class="v-dl">
          <li><a class="btn" href="${WW.api.url(`/api/nisar/passagens/${sel.n}/geojson?download=true`)}" download>${WW.icon.download} GeoJSON · ${dBR(sel.data)}</a><span>${feats.length} polígonos de cheia/seca desta passagem</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/geojson?mes=${MES}&download=true`)}" download>${WW.icon.download} GeoJSON · julho inteiro</a><span>todas as passagens de ${MES_NOME}</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/exportar?formato=csv&mes=${MES}`)}" download>${WW.icon.download} Exportar CSV</a><span>uma linha por passagem</span></li>
          <li><a class="btn" href="${WW.api.url(`/api/nisar/exportar?formato=json&mes=${MES}`)}" download>${WW.icon.download} Exportar JSON</a><span>passagens, municípios e metadados</span></li>
          <li><a class="btn" href="${WW.api.url(sel.imagens.radar)}" download="radar_${sel.data}.png">${WW.icon.download} Imagem de radar (PNG)</a><span>${dLong(sel.data)}</span></li>
        </ul>${stamp()}`;
      WW.$("#vImg", root).innerHTML = imagesHTML(data, sel.n) +
        `<figure class="v-fig v-fig-wide"><img src="${WW.api.url(sel.imagens.slide)}" data-radar-n="${sel.n}" data-radar-kind="slide" alt="Painel do radar com cheia e seca demarcadas em ${dLong(sel.data)}" loading="lazy">
          <figcaption><b>Radar e cheia/seca demarcadas · ${dLong(sel.data)}</b><span>${LOCAL} · imagem do processamento</span></figcaption></figure>`;
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
            <h3 class="v-h3">Parâmetros</h3>
            <dl class="v-meta">
              <div><dt>Sistema de coordenadas</dt><dd>EPSG:4326 · WGS 84 (graus decimais)</dd></div>
              <div><dt>Área coberta</dt><dd>NO ${nw.map((v) => WW.fmt(v, 3)).join(", ")} · SE ${se.map((v) => WW.fmt(v, 3)).join(", ")} (${WW.fmt(kmW, 1)} × ${WW.fmt(kmH, 1)} km)</dd></div>
              <div><dt>Imagem de radar (miniatura)</dt><dd id="vPx">—</dd></div>
              <div><dt>Passagens na série</dt><dd>${todasPassagens.length} · ${data.resumo.por_trilha.map((t) => `${orbita(t.trilha)}: ${orbitaNome(t.trilha)}`).join(" · ")}</dd></div>
              <div><dt>Área por município</dt><dd>polígono atribuído ao município que contém o centróide (malha IBGE)</dd></div>
              <div><dt>Rotas da API usadas</dt><dd class="mono">/api/nisar/passagens · /api/nisar/geojson?mes=${MES} · /api/nisar/municipios?mes=${MES} · /api/nisar/metadados</dd></div>
            </dl>
          </div>
          <div>
            <h3 class="v-h3">Polígonos da passagem selecionada</h3>
            <div class="v-table-wrap v-scroll-y" id="vPolys"></div>
          </div>
        </div>
        <h3 class="v-h3">Série completa por passagem</h3>
        <div class="v-table-wrap"><table class="v-table v-table-tech">
          <thead><tr><th scope="col">#</th><th scope="col">Data</th><th scope="col">Trilha</th><th scope="col">Pol.</th><th scope="col" class="num">Pass. órbita</th><th scope="col" class="num">Água km²</th><th scope="col" class="num">Cheia km²</th><th scope="col" class="num">Seca km²</th><th scope="col">Janela</th><th scope="col">Grânulo</th></tr></thead>
          <tbody>${todasPassagens.map((p) => `<tr data-n="${p.n}" class="${sel && p.n === sel.n ? "is-sel" : ""}">
            <td>${p.n}</td><th scope="row">${dLong(p.data)}</th><td class="mono">${WW.esc(p.trilha)}</td><td>${WW.esc(p.pol)}</td>
            <td class="num">${p.passagens_na_orbita}</td><td class="num">${WW.fmt(p.agua_km2, 1)}</td><td class="num ${p.cheia_km2 ? "has" : ""}">${WW.fmt(p.cheia_km2, 1)}</td><td class="num">${WW.fmt(p.seca_km2, 1)}</td>
            <td>${p.na_janela_da_enchente ? "sim" : "—"}</td><td class="mono">${WW.esc(p.granulo)}</td></tr>`).join("")}</tbody>
        </table></div>`;
      const probe = new Image();
      probe.onload = () => {
        const el = WW.$("#vPx", root);
        if (el) el.textContent = `${probe.naturalWidth} × ${probe.naturalHeight} px · ≈ ${WW.fmt((kmW * 1000) / probe.naturalWidth, 0)} m/px (visualização, não a resolução do produto)`;
      };
      probe.src = WW.api.url(todasPassagens[0].imagens.radar);
      renderDeepPolys();
    }
    function renderDeepPolys() {
      const box = WW.$("#vPolys", root);
      if (!box || !sel) return;
      const rows = polygonRows(data.change.features.filter((f) => f.properties.data === sel.data));
      box.innerHTML = rows.length ? `<table class="v-table v-table-tech">
        <thead><tr><th scope="col">Classe</th><th scope="col" class="num">Área m²</th><th scope="col" class="num">Lat</th><th scope="col" class="num">Lon</th><th scope="col">Município</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="${r.classe === "cheia" ? "has" : ""}">${r.classe}</td><td class="num">${WW.fmt(r.area_m2)}</td><td class="num">${r.centroide_lat}</td><td class="num">${r.centroide_lon}</td><td>${WW.esc(r.municipio || "fora da malha")}</td></tr>`).join("")}</tbody>
      </table><p class="v-foot-note">${rows.length} polígonos · ${dLong(sel.data)}</p>`
        : `<p class="v-foot-note">Nenhum polígono de cheia ou seca em ${dLong(sel.data)}.</p>`;
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
        msg.textContent = `Arquivo gerado: ${file.filename}. Sem dados da sua conta.`;
      } catch (e) {
        msg.textContent = "Não foi possível exportar: " + (e.message || e);
      } finally { btn.disabled = false; }
    }
    if (WW.mode.isDeep()) WW.$("#vExpBtn", root).addEventListener("click", exportar);

    function renderMeta() {
      const m = meta, c = m.area_coberta;
      WW.$("#vMeta", root).innerHTML = `<dl class="v-meta">
        <div><dt>Local</dt><dd>${WW.esc(m.local)}</dd></div>
        <div><dt>Mês exibido</dt><dd>${MES_NOME}</dd></div>
        <div><dt>Satélite</dt><dd>${WW.esc(m.satelite)}</dd></div>
        <div><dt>Produto</dt><dd>${WW.esc(m.produto)} · banda ${WW.esc(m.banda)} · ${m.polarizacao.join(", ")}</dd></div>
        <div><dt>Fonte</dt><dd>${WW.esc(m.fonte)}</dd></div>
        <div><dt>Área coberta</dt><dd>lat ${WW.fmt(c.sul, 2)} a ${WW.fmt(c.norte, 2)} · lon ${WW.fmt(c.oeste, 2)} a ${WW.fmt(c.leste, 2)}</dd></div>
        <div><dt>Série</dt><dd>${m.periodo.passagens} passagens, ${dLong(m.periodo.inicio)} a ${dLong(m.periodo.fim)}</dd></div>
        <div><dt>Órbitas</dt><dd>${m.trilhas.map((t) => `${orbitaNome(t.trilha)} ${WW.esc(orbita(t.trilha))} (${t.passagens})`).join(" · ")}</dd></div>
        ${m.janela_da_enchente ? `<div><dt>Janela da enchente</dt><dd>${dLong(m.janela_da_enchente.inicio)} a ${dLong(m.janela_da_enchente.fim)} <small>· ${WW.esc(m.janela_da_enchente.origem)}</small></dd></div>` : ""}
        ${sel ? `<div><dt>Grânulo (${dBR(sel.data)})</dt><dd class="mono">${WW.esc(sel.granulo)}</dd></div>` : ""}
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
              <label>Antes<select id="cmpA"></select></label>
              <label>Depois<select id="cmpD"></select></label>
            </div>
            <div class="v-compare" id="cmpBox" style="--pos:50%">
              <img class="before" id="cmpImgA" data-radar-kind="radar" alt="">
              <img class="after" id="cmpImgD" data-radar-kind="radar" alt="">
              <span class="handle" aria-hidden="true"></span>
              <span class="tag l" id="cmpTagA"></span><span class="tag r" id="cmpTagD"></span>
              <input type="range" id="cmpRange" min="0" max="100" value="50" aria-label="Divisão entre antes e depois" aria-valuetext="50% da imagem mostra o depois">
            </div>
          </div>
          <div class="v-explain">
            <p>As duas imagens são passagens reais do satélite, da <b>mesma órbita</b>, para a comparação ser justa. Água lisa aparece escura no radar; cidades aparecem claras.</p>
            <p id="cmpTxt"></p>
            <p class="v-keys">Atalhos do comparador: <kbd>←</kbd> <kbd>→</kbd> movem 5% · <kbd>Home</kbd> mostra só o antes · <kbd>End</kbd> mostra só o depois.</p>
            ${stamp()}
          </div>
        </div>`;
      const selA = WW.$("#cmpA", box), selD = WW.$("#cmpD", box), range = WW.$("#cmpRange", box), cmp = WW.$("#cmpBox", box);
      const opt = (p, cur) => `<option value="${p.n}" ${p.n === cur.n ? "selected" : ""}>${dLong(p.data)} · ${orbitaNome(p.trilha)}</option>`;
      function fill() {
        selD.innerHTML = todas.map((p) => opt(p, depois)).join("");
        selA.innerHTML = todas.filter((p) => p.trilha === depois.trilha && p.data < depois.data).map((p) => opt(p, antes)).join("") || `<option>—</option>`;
        WW.$("#cmpImgA", box).src = WW.api.url(antes.imagens.radar); WW.$("#cmpImgA", box).alt = `Radar antes, ${dLong(antes.data)}`;
        WW.$("#cmpImgD", box).src = WW.api.url(depois.imagens.radar); WW.$("#cmpImgD", box).alt = `Radar depois, ${dLong(depois.data)}`;
        WW.$("#cmpImgA", box).dataset.radarN = antes.n; WW.$("#cmpImgD", box).dataset.radarN = depois.n;
        WW.$("#cmpTagA", box).textContent = "Antes · " + dBR(antes.data);
        WW.$("#cmpTagD", box).textContent = "Depois · " + dBR(depois.data);
        const dif = depois.agua_km2 - antes.agua_km2;
        WW.$("#cmpTxt", box).innerHTML = `Água vista: <b>${km2(antes.agua_km2)}</b> em ${dBR(antes.data)} e <b>${km2(depois.agua_km2)}</b> em ${dBR(depois.data)} (${dif >= 0 ? "+" : ""}${WW.fmt(dif, 1)} km²). Água fora do normal em ${dBR(depois.data)}: <b>${km2(depois.cheia_km2)}</b>.`;
      }
      function setPos(v) {
        v = WW.clamp(v, 0, 100); range.value = v;
        cmp.style.setProperty("--pos", v + "%");
        range.setAttribute("aria-valuetext", `${100 - v}% da imagem mostra o depois`);
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
        <p class="v-lead">${todas.length} passagens válidas · de ${dLong(todas[0].data)} a ${dLong(todas[todas.length - 1].data)}. O NISAR repete cada órbita a cada 12 dias; somando as passagens ascendente e descendente, olha o vale a cada poucos dias. A faixa destacada é a janela da enchente.</p>
        <div class="v-tl-bars" id="tlBars" role="group" aria-label="Água por passagem">${todas.map((p, k) => `
          <button type="button" class="o${orbs.indexOf(p.trilha)} ${p.na_janela_da_enchente ? "flood" : ""}" data-k="${k}" aria-pressed="false"
            title="${dLong(p.data)}, órbita ${orbitaNome(p.trilha)}, ${WW.fmt(p.agua_km2, 1)} km² de água${p.cheia_km2 ? `, ${WW.fmt(p.cheia_km2, 1)} km² fora do normal` : ""}">
            ${p.cheia_km2 ? '<span class="cheia-dot"></span>' : ""}<span class="b" style="height:${(p.agua_km2 / max) * 100}%"></span>
            <span class="sr-only">${dLong(p.data)}</span></button>`).join("")}
        </div>
        <div class="v-tl-axis"><span>${dBR(todas[0].data)}</span><span>${dBR(todas[Math.floor(todas.length / 2)].data)}</span><span>${dBR(todas[todas.length - 1].data)}</span></div>
        <div class="v-legend" style="margin-top:8px"><span><i style="background:var(--water)"></i>Órbita ${orbitaNome(orbs[0])}</span>${orbs[1] ? `<span><i style="background:var(--terrain)"></i>Órbita ${orbitaNome(orbs[1])}</span>` : ""}<span><i class="lg-cheia" style="border-radius:50%;width:8px;height:8px"></i>Teve água fora do normal</span></div>
        <div class="v-tl-ctl">
          <button class="btn btn-icon" type="button" id="tlPrev" aria-label="Passagem anterior">${WW.icon.prev}</button>
          <button class="btn btn-icon btn-primary" type="button" id="tlPlay" aria-label="Reproduzir as ${todas.length} passagens">${WW.icon.play}</button>
          <button class="btn btn-icon" type="button" id="tlNext" aria-label="Próxima passagem">${WW.icon.next}</button>
          <span class="v-tl-now" id="tlNow" aria-live="polite"></span>
        </div>
        <div class="v-tl-body">
          <figure class="v-fig"><img id="tlImg" data-radar-kind="radar" alt=""><figcaption><b id="tlCap"></b><span>${LOCAL}</span></figcaption></figure>
          <div class="v-explain">
            <p><b>Como ler a linha do tempo:</b> cada barra é uma passagem do satélite, com a água que o radar viu naquele dia. Barras da mesma cor são da mesma órbita e podem ser comparadas entre si. Entre órbitas diferentes o número muda por causa do ângulo de visada, não porque o rio subiu.</p>
            <p id="tlTxt"></p>
            ${stamp("série completa de jun a out/2026")}
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
        WW.$("#tlImg", box).alt = `Radar NISAR de ${dLong(p.data)}`;
        WW.$("#tlCap", box).textContent = `Radar · ${dLong(p.data)}`;
        WW.$("#tlNow", box).innerHTML = `<b>${i + 1}/${todas.length}</b> · ${dLong(p.data)} · órbita ${orbitaNome(p.trilha)}`;
        WW.$("#tlTxt", box).innerHTML = `${dLong(p.data)}, órbita ${orbitaNome(p.trilha)} (${orbita(p.trilha)}): <b>${km2(p.agua_km2)}</b> de água vista. Fora do normal: <b>${km2(p.cheia_km2)}</b>. Falta de água: <b>${km2(p.seca_km2)}</b>.${p.na_janela_da_enchente ? " Dentro da janela da enchente." : ""}`;
      }
      function stop() { clearInterval(timer); timer = 0; const b = WW.$("#tlPlay", box); b.innerHTML = WW.icon.play; b.setAttribute("aria-label", `Reproduzir as ${todas.length} passagens`); }
      bars.forEach((b) => b.addEventListener("click", () => { stop(); show(+b.dataset.k); }));
      WW.$("#tlPrev", box).addEventListener("click", () => { stop(); show(i - 1); });
      WW.$("#tlNext", box).addEventListener("click", () => { stop(); show(i + 1); });
      WW.$("#tlPlay", box).addEventListener("click", (e) => {
        if (timer) return stop();
        e.currentTarget.innerHTML = WW.icon.pause; e.currentTarget.setAttribute("aria-label", "Pausar");
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
        <b>${dBR(p.data)}</b><span>órbita ${orbitaNome(p.trilha)}${p.cheia_km2 ? " · cheia" : ""}</span></button>`).join("");
      WW.$("#vDates", root).addEventListener("click", (e) => { const b = e.target.closest("button[data-n]"); if (b) select(+b.dataset.n); });

      const tracks = r.por_trilha.map((t) => t.trilha);
      const max = Math.max(...d.passagens.map((p) => p.agua_km2));
      WW.$("#vArea", root).innerHTML = `
        <p class="v-lead">Água vista pelo radar em cada passagem de julho, separada por órbita. ${WW.esc(r.aviso)}</p>
        <ul class="v-hbars">${d.passagens.map((p) => `<li>
          <span class="hb-l">${dBR(p.data)} <small>${orbitaNome(p.trilha)}</small></span>
          <span class="hb-t"><span class="hb-f t${tracks.indexOf(p.trilha)}" style="width:${(p.agua_km2 / max) * 100}%"></span></span>
          <span class="hb-v">${km2(p.agua_km2)}</span></li>`).join("")}</ul>
        <dl class="v-nums v-nums-sm">
          <div><dt>Fora do normal no mês</dt><dd>${km2(r.cheia_km2)}</dd></div>
          <div><dt>Falta de água no mês</dt><dd>${km2(r.seca_km2)}</dd></div>
        </dl>${stamp()}`;

      WW.$("#vTwo", root).innerHTML = `
        <dl class="v-two">
          <div><dt>Água vista em cada passagem</dt><dd>${r.por_trilha.map((t) => `${WW.fmt(t.agua_min_km2, 1)}–${WW.fmt(t.agua_max_km2, 1)}`).join(" / ")} km²</dd>
            <p>Toda a superfície que o radar viu como água: o rio e o que mais estiver alagado. Depende da órbita (${r.por_trilha.map((t) => orbitaNome(t.trilha)).join(" / ")}).</p></div>
          <div><dt>Água fora do normal no mês</dt><dd>${km2(r.cheia_km2)}</dd>
            <p>Só o que apareceu além do normal para aquela época${r.pico ? `, quase tudo em ${dBR(r.pico.data)}` : ""}.</p></div>
        </dl>
        <p class="v-foot-note">Os dois estão certos; respondem perguntas diferentes: “quanta água tem?” e “quanto disso é fora do normal?”.</p>${stamp()}`;

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
          <thead><tr><th scope="col">Município</th>${m.datas.map((dt) => `<th scope="col" class="num">${dBR(dt)}</th>`).join("")}<th scope="col" class="num">Cheia no mês</th><th scope="col" class="num">Seca no mês</th></tr></thead>
          <tbody>${rows.map((x) => `<tr>
            <th scope="row">${WW.esc(x.nome)}</th>
            ${x.por_data.map((pd) => `<td class="num ${pd.cheia_km2 ? "has" : ""}">${pd.cheia_km2 ? WW.fmt(pd.cheia_km2 * 100, 1) + " ha" : "·"}</td>`).join("")}
            <td class="num"><span class="cell-bar" style="--w:${(x.cheia_km2 / max) * 100}%"></span>${WW.fmt(x.cheia_km2 * 100, 1)} ha</td>
            <td class="num">${WW.fmt(x.seca_km2 * 100, 1)} ha</td></tr>`).join("")}</tbody>
        </table></div>
        ${zero.length ? `<details class="v-more"><summary>Mais ${zero.length} municípios na área observada sem cheia nem seca em ${MES_NOME}</summary><p>${zero.map((x) => WW.esc(x.nome)).join(" · ")}</p></details>` : ""}
        <p class="v-foot-note">Valores em hectares (1 ha = 0,01 km²). Só municípios que tocam a área observada pelo radar.</p>${stamp()}`;
    }).catch((e) => { WW.$("#vMuni", root).innerHTML = failed(e); });

    api("/api/nisar/metadados").then((m) => {
      meta = m; renderMeta();
      const v = m.vegetacao_alagada;
      WW.$("#vVeg", root).innerHTML = `<div class="v-unavailable">
        <span class="chip">Ainda sem dado</span>
        <p>${WW.esc(v.motivo)}</p>
        <p class="v-foot-note"><b>O que falta:</b> ${WW.esc(v.requer)}</p>
      </div>${stamp()}`;
      WW.$("#vHow", root).innerHTML = `<div class="v-explain">
        <p>O radar do NISAR (banda L, polarização ${m.polarizacao.join("/")}) manda micro-ondas e mede o que volta. <b>Água lisa reflete para longe e aparece escura</b>; cidades e mata devolvem mais sinal e aparecem claras. Por isso o radar enxerga de dia, de noite e com nuvem.</p>
        <p>Cada passagem foi comparada com o normal para aquela época. Onde apareceu água a mais, o pixel virou <b>cheia</b>; onde faltou, <b>seca</b>.</p>
        <div class="v-classes">${Object.entries(m.classes).map(([k, t]) => `<span class="chip"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--data-${k})"></i>${WW.esc(k)}: ${WW.esc(t)}</span>`).join("")}</div>
        <p><b>Limites:</b> água rasa com vento ou com vegetação alta pode não ser vista como água aberta; áreas urbanas densas geram dupla reflexão e podem esconder água entre prédios; sombra de morro também aparece escura.</p>
      </div>${stamp()}`;
    }).catch((e) => { WW.$("#vMeta", root).innerHTML = failed(e); WW.$("#vVeg", root).innerHTML = failed(e); WW.$("#vHow", root).innerHTML = failed(e); });
  };
})(window.WW);
