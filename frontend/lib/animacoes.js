/**
 * Animações editoriais com GSAP (recomendações da skill UI/UX Pro Max):
 *  - revelarTitulo: título entra palavra por palavra (SplitText, expo.out, 400–700 ms)
 *  - instalarMagnetico: botão principal "puxa" levemente o cursor (força limitada a 0,3)
 *  - historiaRolagem: passos de texto que trocam o estado do mapa fixo (ScrollTrigger)
 * Todas pulam o movimento e mostram o estado final quando o sistema pede "reduzir movimento".
 */
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reduzirMovimento } from './movimento';

let registrado = false;
function registrar() {
  if (registrado || typeof window === 'undefined') return;
  gsap.registerPlugin(SplitText, ScrollTrigger);
  registrado = true;
}

/** Revela um título palavra por palavra. Retorna a função de limpeza (restaura o texto original). */
export function revelarTitulo(el, { atraso = 0 } = {}) {
  if (!el) return () => {};
  registrar();
  if (reduzirMovimento()) return () => {};
  const split = SplitText.create(el, { type: 'words,lines', mask: 'lines', linesClass: 'linha-mascara' });
  const tl = gsap.from(split.words, { yPercent: 110, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.045, delay: atraso });
  return () => { tl.kill(); split.revert(); };
}

/** Efeito magnético nos elementos com [data-magnetico]. */
export function instalarMagnetico() {
  if (typeof document === 'undefined' || document.__magnetico) return;
  document.__magnetico = true;
  registrar();
  const FORCA = 0.3;   // limita o deslocamento para o botão nunca sair da própria área
  document.addEventListener('pointermove', (e) => {
    if (reduzirMovimento() || e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('[data-magnetico]');
    document.querySelectorAll('[data-magnetico].puxando').forEach((o) => {
      if (o !== el) { o.classList.remove('puxando'); gsap.to(o, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' }); }
    });
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.classList.add('puxando');
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * FORCA, y: (e.clientY - r.top - r.height / 2) * FORCA, duration: 0.3, ease: 'power2.out' });
  });
}

/**
 * Rolagem com capítulos: cada passo [data-passo] ativa um estado do mapa fixo.
 * aoMudar(i) é chamado quando o passo i chega ao centro da tela.
 * Também anima o "zoom" do mapa (data-escala / data-x / data-y de cada passo) com scrub.
 */
export function historiaRolagem(raiz, figura, aoMudar) {
  registrar();
  const passos = [...raiz.querySelectorAll('[data-passo]')];
  const rapido = reduzirMovimento();
  const gatilhos = passos.map((p, i) => ScrollTrigger.create({
    trigger: p, start: 'top 60%', end: 'bottom 60%',
    onToggle: (s) => { if (s.isActive) aoMudar(i); },
  }));
  const ctx = gsap.context(() => {
    passos.forEach((p) => {
      const alvo = { scale: +(p.dataset.escala || 1), xPercent: +(p.dataset.x || 0), yPercent: +(p.dataset.y || 0) };
      if (rapido) return;
      gsap.to(figura, { ...alvo, ease: 'none', scrollTrigger: { trigger: p, start: 'top 85%', end: 'top 40%', scrub: 1 } });
    });
  }, raiz);
  requestAnimationFrame(() => ScrollTrigger.refresh());
  return () => { gatilhos.forEach((g) => g.kill()); ctx.revert(); };
}
