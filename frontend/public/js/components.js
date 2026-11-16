/* ==========================================================================
   Componentes reutilizáveis (login, Aba 1 e Aba 2)
   Scripts clássicos (sem módulos) para o mockup abrir também via file://
   ========================================================================== */
window.WW = window.WW || {};

(function (WW) {
  "use strict";

  /* ------------------------------------------------------------------ util */
  WW.$ = (sel, root = document) => root.querySelector(sel);
  WW.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  WW.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  WW.reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  WW.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  WW.lerp = (a, b, t) => a + (b - a) * t;
  WW.fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* Gerador pseudoaleatório determinístico (dados simulados estáveis por id) */
  WW.rng = function (seed) {
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  };

  /* ----------------------------------------------------------------- ícones */
  const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  WW.icon = {
    pin: I('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
    chevron: I('<path d="M9 6l6 6-6 6"/>'),
    back: I('<path d="M15 6l-6 6 6 6"/>'),
    down: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    rain: I('<path d="M7 15a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.5 9 3.5 3.5 0 0 1 18 16H7z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>'),
    drop: I('<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>'),
    mountain: I('<path d="M3 20l6-11 4 7 3-4 5 8z"/>'),
    slope: I('<path d="M3 20h18L3 8z"/><path d="M7 20a5 5 0 0 0-2-4"/>'),
    radar: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>'),
    temp: I('<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/>'),
    wave: I('<path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-3 5 0"/><path d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-3 5 0"/>'),
    area: I('<path d="M4 4h16v16H4z"/><path d="M4 14l5-4 4 3 7-6"/>'),
    sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: I('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    logout: I('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
    search: I('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'),
    globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    eye: I('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: I('<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    play: I('<path d="M7 5l12 7-12 7z"/>'),
    pause: I('<path d="M8 5v14M16 5v14"/>'),
    next: I('<path d="M6 5l9 7-9 7zM18 5v14"/>'),
    prev: I('<path d="M18 5l-9 7 9 7zM6 5v14"/>'),
    layers: I('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    download: I('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    satellite: I('<path d="M10 10l4 4"/><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1" transform="rotate(45 12 12)"/><path d="M8.5 8.5L4 4l3-3 4.5 4.5M15.5 15.5L20 20l-3 3-4.5-4.5"/><path d="M15 6a3 3 0 0 1 3 3M15 2.5A6.5 6.5 0 0 1 21.5 9"/>'),
    dots: `<svg viewBox="0 0 18 18" aria-hidden="true">${[3, 9, 15].map((y) => [3, 9, 15].map((x) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor"/>`).join("")).join("")}</svg>`,
  };

  /* ----------------------------------------------------------- marca/ícone
     Quatro folhas como na referência "ícone", com o par inferior fechando
     em ponta de gota — água + vegetação. */
  WW.brandMark = (cls = "") => `
    <svg class="brand-mark ${cls}" viewBox="0 0 40 40" aria-hidden="true">
      <path class="leaf" d="M6.2 7.6C13.4 7.2 19 11.6 19.3 18.6 12.1 19.2 6.6 14.8 6.2 7.6Z"/>
      <path class="leaf" d="M33.8 7.6C26.6 7.2 21 11.6 20.7 18.6 27.9 19.2 33.4 14.8 33.8 7.6Z"/>
      <path class="leaf" d="M6.2 21.2C13.6 20.6 19.4 25.4 19.3 34.6 12.6 32.6 6.6 28.6 6.2 21.2Z"/>
      <path class="leaf" d="M33.8 21.2C26.4 20.6 20.6 25.4 20.7 34.6 27.4 32.6 33.4 28.6 33.8 21.2Z"/>
    </svg>`;
  /* Logo oficial. Duas variantes (fundo sem cor, proporção original 6,1:1):
     - logo-on-dark  ← Logo-black.jpeg (texto claro) para fundos escuros
     - logo-on-light ← Logo-white.jpeg (texto escuro) para fundos claros
     variant "auto" troca pelo tema (data-theme); "dark"/"light" fixa a variante. */
  WW.brand = ({ variant = "auto", href = "#/inicio" } = {}) => {
    const dark = `<img class="logo logo--on-dark" src="assets/img/logo-on-dark.webp" width="1389" height="226" alt="Water Waltz" decoding="async">`;
    const light = `<img class="logo logo--on-light" src="assets/img/logo-on-light.webp" width="1360" height="225" alt="Water Waltz" decoding="async">`;
    const imgs = variant === "dark" ? dark : variant === "light" ? light : dark + light;
    return `<a class="brand brand--${variant}" href="${href}" aria-label="Water Waltz — home">${imgs}</a>`;
  };

  /* ------------------------------------------------------- etiqueta da fonte */
  /* Diz de onde vem o dado de cada card. origem: "nisar", "demo", "open-meteo" ou "local" (plano B). */
  WW.sourceLabel = function (origem, { previsao = false } = {}) {
    if (origem === "nisar") return { kind: "real", text: "Real NISAR data" };
    if (origem === "demo") return previsao ? { kind: "demo", text: "Simulated forecast" } : { kind: "demo", text: "Illustrative data" };
    if (origem === "open-meteo") return { kind: "open", text: "Open-Meteo forecast" };
    if (origem === "sentinel-1") return { kind: "real", text: "Real Sentinel-1 data" };
    if (origem === "local") return { kind: "offline", text: "Saved data (offline)" };
    return null;
  };
  WW.sourceTag = function (origem, opts) {
    const l = WW.sourceLabel(origem, opts);
    return l ? `<span class="src-tag src-${l.kind}"><span class="sr-only">Source: </span>${WW.esc(l.text)}</span>` : "";
  };

  /* ------------------------------------------------------------ selo ENSO */
  /* Fase do El Niño / La Niña e o ONI (anomalia da temperatura do Pacífico, °C). Sem dado, não mostra nada. */
  const FASES = { "El Niño": "el-nino", "La Niña": "la-nina", "Neutro": "neutro" };
  WW.fmtOni = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + WW.fmt(Math.abs(v), 1);
  let ensoSeq = 0;
  WW.ensoBadgeHTML = function (e, id = "ensoPanel") {
    if (!e || !FASES[e.fase] || typeof e.oni !== "number") return "";
    return `<div class="enso" data-fase="${FASES[e.fase]}">
      <button class="enso-btn" type="button" aria-expanded="false" aria-controls="${id}">
        <span class="enso-dot" aria-hidden="true"></span><span class="sr-only">Pacific now: </span>${WW.esc(e.fase)}
        <span class="enso-oni">ONI ${WW.fmtOni(e.oni)}</span>
      </button>
      <div class="enso-panel" id="${id}" role="group" aria-label="About El Niño and La Niña" hidden></div>
    </div>`;
  };
  // Monta o selo em `el` quando o dado chega; enquanto isso (ou sem dado) el fica vazio
  WW.EnsoBadge = function (el) {
    return WW.api.enso().then((e) => {
      const html = WW.ensoBadgeHTML(e, "ensoPanel" + ++ensoSeq);
      if (!html || !el.isConnected) return null;
      el.innerHTML = html;
      const box = el.firstElementChild, btn = box.querySelector(".enso-btn"), panel = box.querySelector(".enso-panel");
      const topico = e.fase === "La Niña" ? "la-nina" : "el-nino";
      let loaded = false;
      const nota = `ONI ${WW.fmtOni(e.oni)} °C in season ${WW.esc(e.estacao)} · NOAA CPC${e.live ? "" : ` · saved data${e.data_snapshot ? " from " + WW.esc(e.data_snapshot) : ""}`}`;
      async function load() {
        loaded = true;
        panel.innerHTML = `<p class="enso-note">Loading…</p>`;
        try {
          const x = await WW.api.explicacao(topico);
          panel.innerHTML = `<b class="enso-title">${WW.esc(x.titulo)}</b><p class="enso-text">${WW.esc(x.resumo)}</p>
            ${e.fase === "Neutro" ? `<p class="enso-text">The Pacific is neutral now: neither El Niño nor La Niña.</p>` : ""}
            <p class="enso-note">${nota}</p>`;
        } catch (err) {
          loaded = false;
          panel.innerHTML = `<p class="enso-note">Could not load the explanation now.<br>${nota}</p>`;
        }
      }
      const toggle = (open) => {
        panel.hidden = !open; btn.setAttribute("aria-expanded", open);
        if (open && !loaded) load();
      };
      btn.addEventListener("click", () => toggle(panel.hidden));
      box.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || panel.hidden) return;
        ev.stopPropagation(); // o selo fica dentro de outros painéis (ex.: a pílula Satélite)
        toggle(false); btn.focus();
      });
      const fora = (ev) => {
        if (!box.isConnected) return document.removeEventListener("click", fora);
        if (!panel.hidden && !box.contains(ev.target)) toggle(false);
      };
      document.addEventListener("click", fora);
      return { close: () => toggle(false) };
    });
  };

  /* ----------------------------------------------------------------- toast */
  WW.toast = function (html, ms = 5200) {
    let box = document.getElementById("toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast"; box.className = "toast"; box.setAttribute("role", "status");
      document.body.appendChild(box);
    }
    box.innerHTML = html;
    box.classList.add("is-on");
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove("is-on"), ms);
  };

  /* --------------------------------------------------------------- tooltip */
  const tip = () => document.getElementById("tooltip");
  WW.tooltip = {
    show(html, x, y) {
      const t = tip(); t.innerHTML = html; t.hidden = false;
      const w = t.offsetWidth, h = t.offsetHeight;
      const nx = x + 14 + w > innerWidth ? x - w - 18 : x;
      const ny = y + 14 + h > innerHeight ? y - h - 18 : y;
      t.style.left = nx + "px"; t.style.top = ny + "px";
    },
    hide() { tip().hidden = true; },
  };

  /* ----------------------------------------------------- modal de confirmação
     WW.confirm({...}) -> Promise<boolean>. Foco preso no diálogo, Esc cancela. */
  WW.confirm = function ({ kicker = "", title, body, path = [], img, confirmLabel = "Confirmar", cancelLabel = "Cancelar" }) {
    return new Promise((resolve) => {
      const root = document.getElementById("modal-root");
      const prev = document.activeElement;
      const crumbs = path.map((p, i) => (i ? WW.icon.chevron : "") + (i === 0 ? `<b>${WW.esc(p)}</b>` : `<span>${WW.esc(p)}</span>`)).join("");
      root.innerHTML = `
        <div class="modal-backdrop" data-close>
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdl-t" aria-describedby="mdl-d">
            ${img ? `<div class="modal-media" style="background-image:url('${img}')"></div>` : ""}
            <div class="modal-body">
              <span class="chip chip-accent"><span class="dot"></span>${WW.esc(kicker)}</span>
              <h2 id="mdl-t">${WW.esc(title)}</h2>
              <p id="mdl-d">${body}</p>
              ${path.length ? `<div class="path" aria-label="Navigation scale">${crumbs}</div>` : ""}
              <div class="modal-actions">
                <button class="btn btn-ghost" data-act="no">${WW.esc(cancelLabel)}</button>
                <button class="btn btn-primary" data-act="yes">${WW.esc(confirmLabel)} ${WW.icon.chevron}</button>
              </div>
            </div>
          </div>
        </div>`;
      const bd = root.firstElementChild;
      const focusables = () => WW.$$("button", bd);
      const close = (val) => {
        document.removeEventListener("keydown", onKey);
        bd.classList.add("is-leaving");
        setTimeout(() => { root.innerHTML = ""; if (prev && prev.focus) prev.focus(); resolve(val); }, 200);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
        if (e.key === "Tab") {
          const f = focusables(); const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      };
      bd.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]");
        if (act) close(act.dataset.act === "yes");
        else if (e.target === bd) close(false);
      });
      document.addEventListener("keydown", onKey);
      requestAnimationFrame(() => WW.$('[data-act="yes"]', bd).focus());
    });
  };

  /* ------------------------------------------------------------ media card */
  WW.mediaCard = ({ img, kicker, title, alt = "" }) => `
    <article class="media-card">
      <img src="${img}" alt="${WW.esc(alt)}" loading="lazy">
      <div class="mc-kicker">${WW.esc(kicker)}</div>
      <h3 class="mc-title">${WW.esc(title)}</h3>
      <button class="dot-btn" type="button" aria-label="Mais detalhes">${WW.icon.dots}</button>
    </article>`;

  /* ----------------------------------------------------------- metric tile */
  WW.metric = ({ label, value, unit = "", delta, dir = "flat", kind = "water", icon = "drop" }) => `
    <div class="metric" data-kind="${kind}">
      <div class="m-label">${WW.icon[icon] || ""}${WW.esc(label)}</div>
      <div class="m-value">${value}<small>${WW.esc(unit)}</small></div>
      ${delta ? `<div class="m-delta ${dir}">${WW.esc(delta)}</div>` : ""}
    </div>`;

  /* ------------------------------------------------------------- notícias */
  WW.newsItem = (n, { thumb = true } = {}) => `
    <article class="news-item" tabindex="0">
      ${thumb && n.img ? `<img class="ni-thumb" src="${n.img}" alt="" loading="lazy">` : ""}
      <div class="ni-meta"><span class="ni-tag">${WW.esc(n.tag)}</span><span>${WW.esc(n.time)}</span></div>
      <h3 class="ni-title">${WW.esc(n.title)}</h3>
      <div class="ni-meta">${WW.esc(n.source)}</div>
    </article>`;

  /* Subaba de notícias: recebe o feed inteiro e mostra SOMENTE a região do usuário.
     É uma visão futura: conteúdo estático de exemplo, sem nenhuma chamada de rede. */
  WW.NewsRail = function (el, { items, user }) {
    const loc = user.location;
    const mine = items.filter((n) => n.region === loc.region);
    el.innerHTML = `
      <div class="rail-head">
        <div class="rail-title"><h2>Local news</h2><span class="chip chip-accent rail-future">Future view</span></div>
        <div class="rail-loc">${WW.icon.pin}<span>${WW.esc(loc.regionName)}<br><span style="color:var(--text-faint)">${WW.esc(loc.municipalityName)} · ${WW.esc(loc.stateUF)}</span></span></div>
      </div>
      <div class="rail-list scroll" role="feed" aria-label="News from ${WW.esc(loc.regionName)}">
        ${mine.length ? mine.map((n, i) => WW.newsItem(n, { thumb: i < 2 })).join("") : `<p class="rail-empty">No news from your region right now.</p>`}
      </div>
      <div class="rail-foot">Future view: sample news written for the prototype. There is no live source yet. <span class="badge-demo">sample</span></div>`;
    return { count: mine.length };
  };

  /* ---------------------------------------------------------------- charts */
  WW.charts = {
    /* Barras de precipitação diária (mm) */
    bars(values, { w = 320, h = 110, labels = [] } = {}) {
      const max = Math.max(...values, 1), bw = w / values.length;
      const bars = values.map((v, i) => {
        const bh = (v / max) * (h - 22);
        return `<rect class="bar ${v === max ? "hi" : ""}" x="${i * bw + 2}" y="${h - 16 - bh}" width="${bw - 4}" height="${Math.max(bh, 1)}" rx="3"><title>${labels[i] || ""}: ${WW.fmt(v, 1)} mm</title></rect>`;
      }).join("");
      const ticks = labels.map((l, i) => (i % 3 === 0 ? `<text x="${i * bw + bw / 2}" y="${h - 2}" text-anchor="middle">${l}</text>` : "")).join("");
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily precipitation">${bars}<line class="axis" x1="0" x2="${w}" y1="${h - 16}" y2="${h - 16}"/>${ticks}</svg>`;
    },
    /* Perfil de elevação com o rio no ponto mais baixo */
    profile(points, { w = 320, h = 120 } = {}) {
      const min = Math.min(...points), max = Math.max(...points);
      const x = (i) => (i / (points.length - 1)) * w;
      const y = (v) => 10 + (1 - (v - min) / (max - min || 1)) * (h - 34);
      const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      const low = points.indexOf(min);
      const waterY = y(min + (max - min) * 0.12);
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Elevation profile">
        <defs><linearGradient id="terrainGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--terrain)" stop-opacity=".45"/><stop offset="1" stop-color="var(--terrain)" stop-opacity="0"/></linearGradient></defs>
        <path class="area" d="${d}L${w},${h - 18}L0,${h - 18}Z"/>
        <rect class="river" x="${x(Math.max(low - 2, 0))}" y="${waterY}" width="${x(4)}" height="${y(min) - waterY + 1}" rx="2"/>
        <path class="line" d="${d}"/>
        <line class="axis" x1="0" x2="${w}" y1="${h - 18}" y2="${h - 18}"/>
        <text x="0" y="${h - 4}">${WW.fmt(max)} m</text><text x="${w}" y="${h - 4}" text-anchor="end">${WW.fmt(min)} m · leito</text>
      </svg>`;
    },
    /* Linha do tempo das passagens do radar: água observada sim/não */
    passes(list, { w = 320, h = 54 } = {}) {
      const step = w / list.length;
      const dots = list.map((p, i) => `<circle class="${p.water ? "obs-yes" : "obs-no"}" cx="${i * step + step / 2}" cy="18" r="${p.water ? 6 : 5}"><title>${p.date}: ${p.water ? "water observed" : "no water observed"}</title></circle>`).join("");
      const ticks = list.map((p, i) => (i % 2 === 0 ? `<text x="${i * step + step / 2}" y="${h - 4}" text-anchor="middle">${p.date}</text>` : "")).join("");
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Passagens do radar">${dots}${ticks}</svg>`;
    },
  };
})(window.WW);
