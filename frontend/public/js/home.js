/* ==========================================================================
   Aba 1 — Visão geral
   - 1/4 da calota do globo no canto inferior esquerdo (região do usuário clicável)
   - subaba de 180 px com notícias só da região do usuário
   - ícone no canto superior esquerdo (topbar) e frase central
   ========================================================================== */
(function (WW) {
  "use strict";

  WW.Home = function (root, { content, onRegion }) {
    const user = content.user, loc = user.location;
    const words = "See where the water goes,".split(" ");
    const em = "even through the clouds.".split(" ");
    let wi = 0;
    const h1 = words.map((w) => `<span class="word" style="--i:${wi++}">${w}</span>`).join(" ")
      + " <em>" + em.map((w) => `<span class="word" style="--i:${wi++}">${w}</span>`).join(" ") + "</em>";

    root.innerHTML = `
      <div class="home-bg" id="homeBg">
        <div class="rocks"></div>
      </div>

      <div class="sat" id="sat">
        <div class="enso-slot" id="ensoSlot"></div>
        <button class="sat-btn" type="button" id="satBtn" aria-expanded="false" aria-controls="satPanel">
          ${WW.icon.satellite}<span>Satellite</span><span class="sat-tag">NISAR</span>
        </button>
        <div class="sat-panel" id="satPanel" role="dialog" aria-label="NISAR satellite" hidden></div>
      </div>

      <div class="globe-quarter" id="globeQuarter"></div>

      <section class="hero" aria-labelledby="hero-title">
        <span class="kicker"><span class="chip chip-water"><span class="dot live"></span>NISAR radar · L-band</span></span>
        <h1 id="hero-title">${h1}</h1>
        <p>The radar sees the ground by day, by night and under rain. Here you see where it observed water over time in your region — a record of what was seen, not a forecast.</p>
        <div class="hero-facts">
          <span class="chip">21 images since Jun 2026</span>
          <span class="chip">Revisit every 12 days</span>
          <span class="chip">Focus: ${WW.esc(loc.regionName)}, ${WW.esc(loc.stateUF)}</span>
        </div>
      </section>

      <aside class="region-cta" aria-label="Your region">
        <div>
          <div class="kicker">Your region</div>
          <div class="rc-title">${WW.esc(loc.continent)}</div>
          <div class="rc-sub">${WW.esc(loc.municipalityName)} · ${WW.esc(loc.stateName)}</div>
        </div>
        <button class="dot-btn" type="button" id="regionBtn" aria-label="Explore data for ${WW.esc(loc.continent)}">${WW.icon.dots}</button>
      </aside>

      <aside class="news-rail" id="newsRail" aria-label="News from your region"></aside>`;

    WW.NewsRail(WW.$("#newsRail", root), { items: content.news, user });
    WW.EnsoBadge(WW.$("#ensoSlot", root)); // El Niño / La Niña: sem dado, o espaço fica vazio
    WW.$("#regionBtn", root).addEventListener("click", () => onRegion());

    /* ---------------- Globo (1/4 de calota) ---------------- */
    const holder = WW.$("#globeQuarter", root);
    function sizeHolder() {
      const vh = innerHeight, vw = innerWidth;
      const mobile = vw < 760;
      const R = mobile ? Math.min(vw * 0.78, vh * 0.42) : Math.min(vh * 0.62, (vw - 180) * 0.44);
      const S = Math.round(R * 1.16);
      holder.style.width = S + "px"; holder.style.height = S + "px";
    }
    sizeHolder();

    const world = window.GEO_WORLD.features;
    const isMine = (f) => f.properties.continent === loc.continent;
    const globe = new WW.Globe(holder, {
      label: "Globe: a quarter of the sphere with South America highlighted",
      rotate: [100, 52, 0],
      sway: !WW.reducedMotion(),
      anchor: (w, h) => [0, h],
      baseScale: (w, h) => h / 1.16,
      pins: [{ lon: loc.lon, lat: loc.lat }],
      layers: [{
        id: "world", features: world, hit: true,
        style: (f, st, c) => {
          const hov = st.hover && st.hover.properties.continent === f.properties.continent;
          if (isMine(f)) return { fill: hov ? c.hover : c.active, alpha: hov ? 0.95 : 0.88, stroke: "rgba(27,23,18,.35)", width: 0.6 };
          return { fill: c.land, alpha: hov ? 0.95 : 0.8, stroke: c.line, width: 0.4 };
        },
      }],
      onHover: (hit, e) => {
        holder.style.cursor = hit && isMine(hit.feature) ? "pointer" : "default";
        if (!hit) return WW.tooltip.hide();
        const p = hit.feature.properties;
        WW.tooltip.show(isMine(hit.feature)
          ? `<strong>${WW.esc(p.continent)}</strong><span class="muted">Your region · ${WW.esc(p.name)}</span><br><span class="go">Click to open the data →</span>`
          : `<strong>${WW.esc(p.continent)}</strong><span class="muted">Outside your region</span>`, e.clientX, e.clientY);
      },
      onClick: (hit) => { if (hit && isMine(hit.feature)) { WW.tooltip.hide(); onRegion(); } },
    });

    /* ---------------- Parallax do fundo ---------------- */
    const bg = WW.$("#homeBg", root);
    const onMove = (e) => {
      if (!WW.motion.full()) return; // parallax só com movimento "full"
      const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
      bg.style.setProperty("--px", (nx * -14).toFixed(1) + "px");
      bg.style.setProperty("--py", (ny * -10).toFixed(1) + "px");
    };
    root.addEventListener("pointermove", onMove);
    const onResize = () => sizeHolder();
    window.addEventListener("resize", onResize);

    /* ---------------- Satélite: pílula + painel com dados do backend ---------------- */
    const sat = WW.$("#sat", root), satBtn = WW.$("#satBtn", root), satPanel = WW.$("#satPanel", root);
    let satLoaded = false;
    const dLong = (iso) => String(iso).slice(0, 10);
    async function loadSat() {
      satLoaded = true;
      satPanel.innerHTML = `<p class="sat-note">Loading satellite data…</p>`;
      try {
        const [ps, meta] = await Promise.all([WW.api.get("/api/nisar/passagens"), WW.api.get("/api/nisar/metadados")]);
        const last = ps.itens[ps.itens.length - 1];
        satPanel.innerHTML = `
          <div class="sat-head"><b>${WW.esc(meta.satelite)}</b><span class="chip chip-water">${WW.esc(meta.banda)}-band · ${meta.polarizacao.join("/")}</span></div>
          <dl class="sat-list">
            <div><dt>Product</dt><dd>${WW.esc(meta.produto)}</dd></div>
            <div><dt>Processed passes</dt><dd>${ps.itens.length} · ${dLong(meta.periodo.inicio)} to ${dLong(meta.periodo.fim)}</dd></div>
            <div><dt>Orbits</dt><dd>${meta.trilhas.map((t) => `${WW.esc(t.trilha)} (${t.passagens})`).join(" · ")}</dd></div>
            <div><dt>Latest pass</dt><dd>${dLong(last.data)} · ${WW.fmt(last.agua_km2, 1)} km² of water seen</dd></div>
          </dl>
          <a class="btn btn-primary sat-link" href="#/vale/dados">See the passes ${WW.icon.chevron}</a>
          <p class="sat-note">Source: ${WW.esc(meta.fonte)}</p>`;
      } catch (e) {
        satLoaded = false;
        satPanel.innerHTML = `<p class="sat-note">NISAR (NASA/ISRO) · L-band radar, revisit every 12 days.<br>Could not load the passes now (${WW.esc(e.message || e)}).</p>`;
      }
    }
    function toggleSat(open) {
      satPanel.hidden = !open;
      satBtn.setAttribute("aria-expanded", open);
      if (open && !satLoaded) loadSat();
    }
    satBtn.addEventListener("click", () => toggleSat(satPanel.hidden));
    document.addEventListener("click", (e) => { if (!satPanel.hidden && !sat.contains(e.target)) toggleSat(false); });
    sat.addEventListener("keydown", (e) => { if (e.key === "Escape") { toggleSat(false); satBtn.focus(); } });

    return {
      show() { globe.refreshColors(); globe.resize(); globe.start(); },
      hide() { globe.stop(); WW.tooltip.hide(); toggleSat(false); },
      theme() { globe.refreshColors(); },
      rotation() { return globe.view.rotate.slice(); },
    };
  };
})(window.WW);
