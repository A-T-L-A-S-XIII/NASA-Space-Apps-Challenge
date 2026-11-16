/* ==========================================================================
   WW.Globe — globo/mapa em canvas reutilizado nas duas abas.
   - Aba 1: 1/4 da calota no canto inferior esquerdo (anchor no canto).
   - Aba 2: mapa cheio que faz zoom continente → país → estado → município.
   Projeção ortográfica (d3-geo) para todas as escalas: a transição entre
   níveis é uma única "viagem" contínua de rotação + escala.
   ========================================================================== */
(function (WW) {
  "use strict";

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function Globe(container, opts) {
    this.el = container;
    this.opts = Object.assign({ layers: [], pins: [], sway: false, anchor: null, baseScale: null, padding: 48 }, opts);
    this.layers = this.opts.layers;
    this.state = {};
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", opts.label || "Interactive Earth globe");
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.bctx = this.base.getContext("2d");
    this.proj = d3.geoOrthographic().clipAngle(90).precision(0.35);
    this.path = d3.geoPath(this.proj, this.bctx);
    this.grat = d3.geoGraticule10();
    this.view = { rotate: opts.rotate || [55, 20, 0], scale: 300, translate: [0, 0] };
    this.hover = null;
    this.dirty = true;
    this.t0 = performance.now();
    this.refreshColors();
    this._bounds = new WeakMap();
    this._bind();
    this.resize();
    this._loop = this._loop.bind(this);
    this.running = false;
  }

  Globe.prototype.refreshColors = function () {
    this.c = {
      ocean1: css("--globe-ocean-1"), ocean2: css("--globe-ocean-2"),
      land: css("--globe-land"), land2: css("--globe-land-2"),
      line: css("--globe-line"), grat: css("--globe-grat"),
      active: css("--globe-active"), hover: css("--globe-hover"),
      glow: css("--globe-glow"), dim: css("--globe-dim"),
      text: css("--text"), bg: css("--bg"), water: css("--water"),
    };
    this.dirty = true;
  };

  Globe.prototype.resize = function () {
    const r = this.el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) return; // aba oculta: redimensiona quando voltar a aparecer
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(r.width, 1); this.h = Math.max(r.height, 1); this.dpr = dpr;
    for (const cv of [this.canvas, this.base]) {
      cv.width = Math.round(this.w * dpr); cv.height = Math.round(this.h * dpr);
    }
    this.canvas.style.width = this.w + "px"; this.canvas.style.height = this.h + "px";
    if (this.opts.anchor) this.view.translate = this.opts.anchor(this.w, this.h);
    if (this.opts.baseScale && !this._fitted) this.view.scale = this.opts.baseScale(this.w, this.h);
    if (this._lastFit) { const f = this.fit(this._lastFit.target, this._lastFit.pad); Object.assign(this.view, f); }
    this.dirty = true;
    this.draw();
  };

  Globe.prototype._apply = function () {
    this.proj.rotate(this.view.rotate).scale(this.view.scale).translate(this.view.translate);
  };

  /* Enquadramento de uma feição: centraliza no centróide e ajusta a escala */
  Globe.prototype.fit = function (target, pad) {
    const p = Object.assign({ t: 90, r: 40, b: 90, l: 40 }, pad || {});
    const c = d3.geoCentroid(target);
    const pr = d3.geoOrthographic().clipAngle(90).rotate([-c[0], -c[1], 0])
      .fitExtent([[p.l, p.t], [this.w - p.r, this.h - p.b]], target);
    return { rotate: [-c[0], -c[1], 0], scale: pr.scale(), translate: pr.translate() };
  };

  Globe.prototype.planetView = function (rotate) {
    const s = Math.min(this.w, this.h) * 0.4;
    return { rotate: rotate || this.view.rotate.slice(), scale: s, translate: [this.w / 2, this.h / 2] };
  };

  /* Viagem animada; "salto" de escala proporcional à distância angular */
  Globe.prototype.flyTo = function (target, { duration = 1400, fitTarget = null, pad = null } = {}) {
    this._lastFit = fitTarget ? { target: fitTarget, pad } : null;
    this._fitted = true;
    const from = { rotate: this.view.rotate.slice(), scale: this.view.scale, translate: this.view.translate.slice() };
    const to = target;
    if (WW.reducedMotion()) duration = 1;
    const dist = d3.geoDistance([-from.rotate[0], -from.rotate[1]], [-to.rotate[0], -to.rotate[1]]);
    const hop = WW.clamp(dist / Math.PI, 0, 1) * 0.55;
    const iR = d3.interpolate(from.rotate, to.rotate);
    const iT = d3.interpolate(from.translate, to.translate);
    const iS = d3.interpolateNumber(Math.log(from.scale), Math.log(to.scale));
    const id = (this._flight = (this._flight || 0) + 1); // um novo voo cancela o anterior
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (id !== this._flight) return resolve();
        const k = WW.clamp((now - t0) / duration, 0, 1);
        const e = d3.easeCubicInOut(k);
        this.view.rotate = iR(e);
        this.view.translate = iT(e);
        this.view.scale = Math.exp(iS(e)) * (1 - hop * Math.sin(Math.PI * e));
        this.dirty = true;
        this.draw();
        if (k < 1) requestAnimationFrame(step); else { this.flying = false; resolve(); }
      };
      this.flying = true;
      requestAnimationFrame(step);
    });
  };

  /* ----------------------------------------------------------- desenho */
  Globe.prototype._drawBase = function () {
    const ctx = this.bctx, c = this.c, dpr = this.dpr;
    this._apply();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const [cx, cy] = this.view.translate, r = this.view.scale;
    if (!(r > 0)) return;

    // brilho atmosférico
    const g = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.18);
    g.addColorStop(0, c.glow); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2); ctx.fill();

    // oceano
    const o = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    o.addColorStop(0, c.ocean1); o.addColorStop(1, c.ocean2);
    ctx.fillStyle = o; ctx.beginPath(); this.path({ type: "Sphere" }); ctx.fill();

    // graticule
    ctx.beginPath(); this.path(this.grat); ctx.strokeStyle = c.grat; ctx.lineWidth = 0.6; ctx.stroke();

    // camadas
    const st = Object.assign({ hover: this.hover }, this.state);
    const labels = [];
    for (const L of this.layers) {
      if (L.visible && !L.visible(st)) continue;
      for (const f of L.features) {
        const s = L.style(f, st, c);
        if (!s) continue;
        ctx.beginPath(); this.path(f);
        if (s.fill) { ctx.globalAlpha = s.alpha == null ? 1 : s.alpha; ctx.fillStyle = s.fill; ctx.fill(); ctx.globalAlpha = 1; }
        if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width || 0.6; ctx.stroke(); }
        if (L.label && s.label) labels.push({ f, text: s.label, strong: s.strong, minArea: s.minArea });
      }
    }

    // contorno da esfera
    ctx.beginPath(); this.path({ type: "Sphere" }); ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke();

    // rótulos (só os que cabem)
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const l of labels) {
      const cen = d3.geoCentroid(l.f);
      if (d3.geoDistance(cen, [-this.view.rotate[0], -this.view.rotate[1]]) > Math.PI / 2 - 0.05) continue;
      const area = this.path.area(l.f);
      if (area < (l.minArea != null ? l.minArea : l.strong ? 400 : 1800)) continue;
      const [x, y] = this.proj(cen);
      ctx.font = `${l.strong ? 700 : 600} ${l.strong ? 13 : 11.5}px Urbanist, system-ui, sans-serif`;
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(11,21,16,.75)"; ctx.strokeText(l.text, x, y);
      ctx.fillStyle = l.strong ? c.active : "rgba(254,250,223,.92)"; ctx.fillText(l.text, x, y);
    }
    this.dirty = false;
  };

  Globe.prototype.draw = function () {
    if (this.dirty) this._drawBase();
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // pins com pulso
    const t = (performance.now() - this.t0) / 1000;
    for (const p of this.opts.pins) {
      if (d3.geoDistance([p.lon, p.lat], [-this.view.rotate[0], -this.view.rotate[1]]) > Math.PI / 2) continue;
      const [x, y] = this.proj([p.lon, p.lat]);
      const k = this._animated() ? (t % 1.8) / 1.8 : 0.35; // movimento reduzido: anel parado
      ctx.beginPath(); ctx.arc(x, y, 5 + k * 18, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(220,161,93,${(1 - k) * 0.8})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = this.c.active; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#FEFADF"; ctx.stroke();
      if (p.label && this.state.showPinLabel !== false) {
        ctx.font = "700 12px Urbanist, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(11,21,16,.8)"; ctx.strokeText(p.label, x + 12, y);
        ctx.fillStyle = "#FEFADF"; ctx.fillText(p.label, x + 12, y);
      }
    }
  };

  /* O loop contínuo só existe com movimento "full" (giro lento e pulso do pino).
     Com movimento reduzido o globo redesenha só quando algo muda (hover, viagem, resize),
     e em qualquer modo o loop para quando a aba fica em segundo plano. */
  Globe.prototype._animated = function () {
    return WW.motion.full() && (this.opts.sway || this.opts.pins.length > 0);
  };
  Globe.prototype._loop = function (now) {
    if (!this.running || document.hidden || !this._animated()) { this._looping = false; return; }
    if (this.opts.sway && !this.flying) {
      const t = (now - this.t0) / 1000;
      const [b0, b1] = this.opts.rotate;
      this.view.rotate = [b0 + Math.sin(t / 7) * 7, b1 + Math.sin(t / 11) * 2.5, 0];
      this.dirty = true;
    }
    this.draw();
    requestAnimationFrame(this._loop);
  };
  Globe.prototype.start = function () {
    this.running = true;
    this.draw();
    if (!this._looping && this._animated()) { this._looping = true; requestAnimationFrame(this._loop); }
    if (!this._visBound) {
      this._visBound = true;
      document.addEventListener("visibilitychange", () => { if (!document.hidden && this.running) this.start(); });
    }
  };
  Globe.prototype.stop = function () { this.running = false; };

  /* ---------------------------------------------------------- interação */
  Globe.prototype.hitTest = function (x, y) {
    this._apply();
    const [cx, cy] = this.view.translate;
    if (Math.hypot(x - cx, y - cy) > this.view.scale) return null;
    const ll = this.proj.invert([x, y]);
    if (!ll) return null;
    const st = Object.assign({ hover: this.hover }, this.state);
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const L = this.layers[i];
      if (!L.hit || (L.visible && !L.visible(st)) || (L.hitWhen && !L.hitWhen(st))) continue;
      for (const f of L.features) {
        let b = this._bounds.get(f);
        if (!b) { b = d3.geoBounds(f); this._bounds.set(f, b); }
        const [[x0, y0], [x1, y1]] = b;
        if (x0 <= x1 && (ll[0] < x0 || ll[0] > x1)) continue;
        if (ll[1] < y0 || ll[1] > y1) continue;
        if (d3.geoContains(f, ll)) return { layer: L.id, feature: f, lonlat: ll };
      }
    }
    return null;
  };

  Globe.prototype._bind = function () {
    let raf = 0, last = null;
    const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this.canvas.addEventListener("pointermove", (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (this.flying) return;
        const hit = this.hitTest(...pos(last));
        const f = hit ? hit.feature : null;
        if (f !== this.hover) { this.hover = f; this.dirty = true; this.draw(); }
        this.opts.onHover && this.opts.onHover(hit, last);
      });
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.hover = null; this.dirty = true; this.draw();
      this.opts.onHover && this.opts.onHover(null, null);
    });
    this.canvas.addEventListener("click", (e) => {
      if (this.flying) return;
      const hit = this.hitTest(...pos(e));
      this.opts.onClick && this.opts.onClick(hit, e);
    });
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.el);
  };

  WW.Globe = Globe;
})(window.WW);
