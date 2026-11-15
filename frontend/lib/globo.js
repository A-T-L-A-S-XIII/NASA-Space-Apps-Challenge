/**
 * Globo 3D (canvas + d3-geo, projeção ortográfica) em modo "calota": fica parado, grande,
 * ancorado no canto inferior esquerdo, com a região em foco na parte visível da calota.
 * Clique num ponto para selecionar a região; mergulhar(id) leva o globo ao centro e desce até ela.
 */
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import terra110 from '@/data/terra-110m.json';
import { reduzirMovimento } from './movimento';

const TERRA = feature(terra110, terra110.objects.land);
const GRAT = geoGraticule10();
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const acelera = (t) => t * t * t;
const curto = (de, para) => de + ((((para - de) % 360) + 540) % 360) - 180;   // menor caminho em longitude

export function criarGlobo(canvas, { alvos, aoClicarAlvo, inicial }) {
  // cores vêm do tema (styles/temas.css: --globo-*); relidas quando o tema muda
  const C = {};
  function lerCores() {
    const cs = getComputedStyle(canvas), v = (n, pad) => cs.getPropertyValue(n).trim() || pad;
    Object.assign(C, {
      oceano: v('--globo-oceano', '#1F3667'), oceano2: v('--globo-oceano-2', '#142446'), terra: v('--globo-terra', '#2F626C'),
      borda: v('--globo-borda', '#716591'), grade: v('--globo-grade', '#2A4579'), texto: v('--globo-texto', '#F3F3F8'),
      azul: v('--globo-ponto', '#C7C8D7'), azulClaro: v('--globo-ponto-claro', '#FFFFFF'), aura: v('--globo-aura', '60 91 145').split(/[\s,]+/).join(','),
    });
  }
  lerCores();
  const obsTema = new MutationObserver(() => requestAnimationFrame(lerCores));
  obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  if (canvas.parentElement) obsTema.observe(canvas.parentElement, { attributes: true, attributeFilter: ['class'] });   // palco volta ao modo globo
  const ctx = canvas.getContext('2d');
  const proj = geoOrthographic().clipAngle(90).precision(0.4);
  const path = geoPath(proj, ctx);
  const estatico = reduzirMovimento();
  let w = 0, h = 0, raf = 0, ultimo = 0;   // eslint-disable-line no-unused-vars
  let rot = [52, 18, 0];
  let escala = 1, anim = null, opacidade = 1, selecionado = inicial ?? null;
  let foco = 0;                          // 0 = calota no canto · 1 = globo centralizado (durante o mergulho)
  let visiveis = [];

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!anim && foco === 0) rot = rotCalota(alvoAtual());
  }

  /** Geometria da calota (canto inferior esquerdo) e do globo centralizado. */
  function calota() {
    const estreito = w < 640;
    const r = estreito ? Math.min(w * 0.9, h * 0.5) : Math.min(h * 0.68, w * 0.52, 820);
    return { cx: estreito ? w * 0.18 : w * 0.1, cy: h + r * (estreito ? 0.05 : 0.12) - (estreito ? 64 : 0), r, px: 0.4, py: -0.66 };   // no celular, acima da gaveta fechada
  }
  const centralizado = () => ({ cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.38 });
  const mistura = (a, b, k) => a + (b - a) * k;
  function geometria() {
    const a = calota(), b = centralizado();
    return { cx: mistura(a.cx, b.cx, foco), cy: mistura(a.cy, b.cy, foco), r: mistura(a.r, b.r, foco) };
  }
  const alvoAtual = () => alvos.find((x) => x.id === selecionado) ?? alvos.find((x) => x.ativo) ?? alvos[0];

  /**
   * Rotação que põe a região no ponto (px, py) da calota (frações do raio, a partir do centro).
   * A ortográfica não é linear, então ajusta o centro em poucas iterações até o ponto cair no lugar.
   */
  function rotCalota(a) {
    if (!a) return rot;
    const { px, py } = calota();
    const pr = geoOrthographic().clipAngle(90).translate([0, 0]).scale(1);
    const erro = (lon, lat) => {
      pr.rotate([-lon, -lat, 0]);
      if (geoDistance([a.lon, a.lat], [lon, lat]) > Math.PI / 2) return Infinity;
      const [x, y] = pr([a.lon, a.lat]);
      return (x - px) ** 2 + (y - py) ** 2;
    };
    // busca em grade com refinamento (o centro fica a no máximo 90° da região)
    let melhor = [a.lon, a.lat], e0 = Infinity, passo = 4, raio = 88;
    for (let k = 0; k < 4; k++) {
      const [cl, cp] = melhor;
      for (let dl = -raio; dl <= raio; dl += passo) {
        for (let dp = -raio; dp <= raio; dp += passo) {
          const lat = Math.max(-89, Math.min(89, cp + dp)), e = erro(cl + dl, lat);
          if (e < e0) { e0 = e; melhor = [cl + dl, lat]; }
        }
      }
      raio = passo * 1.5; passo /= 6;
    }
    return [-melhor[0], -melhor[1], 0];
  }

  function desenhar(t) {
    const G = geometria();
    proj.translate([G.cx, G.cy]).scale(G.r * escala).rotate(rot);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = opacidade;
    const r = proj.scale(), X = G.cx, Y = G.cy;
    // aura azul
    const g = ctx.createRadialGradient(X, Y, r * 0.96, X, Y, r * 1.28);
    g.addColorStop(0, `rgba(${C.aura},.5)`); g.addColorStop(0.3, `rgba(${C.aura},.18)`); g.addColorStop(1, `rgba(${C.aura},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 1.28, 0, Math.PI * 2); ctx.fill();
    // esfera
    const go = ctx.createRadialGradient(X - r * 0.35, Y - r * 0.35, r * 0.1, X, Y, r);
    go.addColorStop(0, C.oceano); go.addColorStop(1, C.oceano2);
    ctx.fillStyle = go; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
    ctx.strokeStyle = C.grade; ctx.lineWidth = 0.6; ctx.beginPath(); path(GRAT); ctx.stroke();
    ctx.fillStyle = C.terra; ctx.beginPath(); path(TERRA); ctx.fill();
    ctx.strokeStyle = C.borda; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = C.borda; ctx.lineWidth = 1.2; ctx.beginPath(); path({ type: 'Sphere' }); ctx.stroke();

    // pontos das regiões (só na face visível)
    visiveis = [];
    const centro = [-rot[0], -rot[1]];
    for (const a of alvos) {
      if (geoDistance([a.lon, a.lat], centro) > Math.PI / 2 - 0.04) continue;
      const [x, y] = proj([a.lon, a.lat]);
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      visiveis.push({ id: a.id, x, y });
      const sel = a.id === selecionado;
      if (a.ativo) {
        const fase = estatico ? 0.35 : (t / 1600) % 1;
        ctx.strokeStyle = C.azul;
        for (const k of [0, 0.5]) {
          const f = (fase + k) % 1;
          ctx.globalAlpha = opacidade * (1 - f); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 6 + f * 22, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = opacidade;
        ctx.fillStyle = C.azul; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.azulClaro; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        ctx.fillStyle = C.oceano2; ctx.strokeStyle = C.azul; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (sel) {
        ctx.strokeStyle = C.texto; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, a.ativo ? 10 : 8, 0, Math.PI * 2); ctx.stroke();
      }
      if (escala < 1.6 && (sel || a.ativo)) {
        ctx.font = `600 12px 'DM Sans', system-ui, sans-serif`; ctx.fillStyle = C.texto;
        // rótulo da região selecionada sem cena vai à esquerda, para não sobrepor o da região com dados
        if (sel && !a.ativo) { ctx.textAlign = 'right'; ctx.fillText(a.rotulo, x - 13, y + 4); ctx.textAlign = 'left'; }
        else ctx.fillText(a.rotulo, x + 14, y + 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  function quadro(t) {
    ultimo = t;
    if (anim) anim(t);
    desenhar(t);
    raf = requestAnimationFrame(quadro);
  }

  // globo parado: só clique (ou toque) num ponto para escolher a região
  const pontoSob = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let melhor = null, d = 24;
    for (const v of visiveis) { const k = Math.hypot(px - v.x, py - v.y); if (k < d) { d = k; melhor = v; } }
    return melhor;
  };
  const aoClicar = (e) => { const v = pontoSob(e); if (v) aoClicarAlvo?.(v.id); };
  const aoMover = (e) => { canvas.style.cursor = pontoSob(e) ? 'pointer' : 'default'; };
  canvas.addEventListener('click', aoClicar);
  canvas.addEventListener('pointermove', aoMover);

  const ro = new ResizeObserver(medir); ro.observe(canvas);
  medir(); raf = requestAnimationFrame(quadro);

  /** Anima rotação (e, opcionalmente, a saída da calota para o centro); resolve no fim. */
  function girarAte(alvoRot, dur, focoFinal = foco) {
    return new Promise((resolve) => {
      const de = [...rot], para = [curto(de[0], alvoRot[0]), alvoRot[1]];
      const f0 = foco, t0 = performance.now(), T = estatico ? 1 : dur;
      anim = (t) => {
        const k = Math.min(1, (t - t0) / T), e = suave(k);
        rot = [de[0] + (para[0] - de[0]) * e, de[1] + (para[1] - de[1]) * e, 0];
        foco = f0 + (focoFinal - f0) * e;
        if (k >= 1) { anim = null; resolve(); }
      };
    });
  }

  return {
    /** Destaca uma região e gira a calota até ela. */
    selecionar(id) {
      selecionado = id;
      const a = alvos.find((x) => x.id === id);
      if (a) girarAte(rotCalota(a), 1100, 0);
    },
    /** Sai da calota para o centro, alinhado na região, e dá um "mergulho" (zoom + fade). */
    async mergulhar(id) {
      const a = alvos.find((x) => x.id === id);
      if (!a) return;
      selecionado = id;
      await girarAte([-a.lon, -a.lat, 0], 900, 1);
      await new Promise((resolve) => {
        const t0 = performance.now(), T = estatico ? 1 : 1000;
        anim = (t) => {
          const k = Math.min(1, (t - t0) / T), e = acelera(k);
          escala = 1 + e * 7; opacidade = 1 - e;
          if (k >= 1) { anim = null; resolve(); }
        };
      });
    },
    voltar() { escala = 1; opacidade = 1; anim = null; foco = 0; rot = rotCalota(alvoAtual()); },
    destruir() { cancelAnimationFrame(raf); ro.disconnect(); obsTema.disconnect(); canvas.removeEventListener('click', aoClicar); canvas.removeEventListener('pointermove', aoMover); },
  };
}
