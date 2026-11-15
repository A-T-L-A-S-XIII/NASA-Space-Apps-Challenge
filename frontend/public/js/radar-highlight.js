/* ==========================================================================
   Marca-texto de alagamento e seca sobre as imagens de radar.
   - Classificação: a do processamento NISAR, já servida pelo backend em
     /api/nisar/passagens/{n}/geojson (propriedade "classe": "cheia" = alagamento,
     "seca" = seca). Nenhum critério novo é criado aqui.
   - Alagamento em azul, seca em laranja, camada semitransparente (o radar segue
     visível por baixo).
   - Automático: toda <img data-radar-n="N" data-radar-kind="radar|slide"> que
     entra na página (ou troca de passagem) recebe a camada. O mapa de mudança
     desenha a mesma camada sobre a imagem de radar dentro do SVG (vale.js).
   Georreferência: a miniatura de radar cobre exatamente a área processada
   (limites do catálogo). No slide.png, os dois painéis de radar ficam em caixas
   fixas, medidas nos 19 arquivos.
   ========================================================================== */
(function (WW) {
  "use strict";

  const SLIDE = { w: 1800, h: 1056, panels: [[145, 166, 768, 975], [1032, 166, 1655, 975]] };
  const RADAR = { w: 382, h: 496 };
  const STROKE = 7;       // espessura do "marca-texto" em px da miniatura (382 px de largura)
  const OPACITY = 0.42;   // baixa opacidade: o radar continua legível

  let coverP = null;
  const cover = () => (coverP ||= WW.api.get("/api/nisar/passagens").then((r) => r.area_coberta));
  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    return { cheia: cs.getPropertyValue("--hl-alagamento").trim() || "#2F6BFF", seca: cs.getPropertyValue("--hl-seca").trim() || "#FF8A1F" };
  };

  /* Polígonos -> SVG (string), projetados na caixa [x0,y0,x1,y1] da imagem */
  function paths(fc, c, [x0, y0, x1, y1]) {
    const sx = (x1 - x0) / (c.leste - c.oeste), sy = (y1 - y0) / (c.norte - c.sul);
    const pt = ([lon, lat]) => `${(x0 + (lon - c.oeste) * sx).toFixed(1)},${(y0 + (c.norte - lat) * sy).toFixed(1)}`;
    const ring = (r) => "M" + r.map(pt).join("L") + "Z";
    const out = { cheia: [], seca: [] };
    for (const f of fc.features) {
      const k = f.properties && f.properties.classe;
      if (!out[k]) continue;
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const p of polys) out[k].push(p.map(ring).join(""));
    }
    return out;
  }

  WW.radarHighlight = {
    STROKE, OPACITY, RADAR_W: RADAR.w,
    paths,
    colors,
    /* SVG do marca-texto para uma passagem; puro, testável */
    svg(fc, c, kind, col) {
      const W = kind === "slide" ? SLIDE.w : RADAR.w, H = kind === "slide" ? SLIDE.h : RADAR.h;
      const boxes = kind === "slide" ? SLIDE.panels : [[0, 0, RADAR.w, RADAR.h]];
      let body = "";
      for (const b of boxes) {
        const sw = (STROKE * (b[2] - b[0])) / RADAR.w;
        const p = paths(fc, c, b);
        for (const k of ["seca", "cheia"]) {
          if (!p[k].length) continue;
          body += `<path d="${p[k].join("")}" fill="${col[k]}" stroke="${col[k]}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" data-classe="${k}"/>`;
        }
      }
      const clips = boxes.map((b, i) => `<clipPath id="c${i}"><rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}"/></clipPath>`).join("");
      const groups = boxes.length === 1 ? `<g clip-path="url(#c0)">${body}</g>` : `<g>${body}</g>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${clips}</defs><g opacity="${OPACITY}">${groups}</g></svg>`;
    },
  };

  /* ---------------- aplicação automática nas <img> marcadas ---------------- */
  function place(img, hl) {
    const cs = getComputedStyle(img);
    if (cs.position === "absolute") {
      // imagens já posicionadas (comparador): a camada herda as mesmas classes (inclusive o recorte do "depois")
      hl.className = img.className + " radar-hl";
      hl.removeAttribute("style");
      return;
    }
    const parent = img.offsetParent === img.parentElement ? null : img.parentElement;
    if (parent && getComputedStyle(parent).position === "static") parent.style.position = "relative";
    hl.className = "radar-hl";
    Object.assign(hl.style, {
      position: "absolute", left: img.offsetLeft + "px", top: img.offsetTop + "px",
      width: img.offsetWidth + "px", height: img.offsetHeight + "px",
      objectFit: cs.objectFit, objectPosition: cs.objectPosition, borderRadius: cs.borderRadius,
    });
  }

  async function attach(img) {
    const n = +img.dataset.radarN;
    if (!n) return;
    const kind = img.dataset.radarKind === "slide" ? "slide" : "radar";
    let hl = img._radarHl;
    if (!hl) {
      hl = document.createElement("img");
      hl.alt = ""; hl.setAttribute("aria-hidden", "true"); hl.decoding = "async";
      img.insertAdjacentElement("afterend", hl);
      img._radarHl = hl;
      const ro = new ResizeObserver(() => place(img, hl));
      ro.observe(img);
      img.addEventListener("load", () => place(img, hl));
    }
    const token = (img._radarTok = (img._radarTok || 0) + 1);
    try {
      const [c, fc] = await Promise.all([cover(), WW.api.get(`/api/nisar/passagens/${n}/geojson`)]);
      if (token !== img._radarTok) return; // trocou de passagem enquanto carregava
      hl.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(WW.radarHighlight.svg(fc, c, kind, colors()));
      place(img, hl);
    } catch (e) {
      hl.removeAttribute("src"); // sem dado do backend, a imagem fica como estava
    }
  }

  function scan(root) {
    if (root.matches && root.matches("img[data-radar-n]")) attach(root);
    if (root.querySelectorAll) root.querySelectorAll("img[data-radar-n]").forEach(attach);
  }
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") attach(m.target);
        else m.addedNodes.forEach((nd) => nd.nodeType === 1 && scan(nd));
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-radar-n"] });
  }
})(window.WW);
