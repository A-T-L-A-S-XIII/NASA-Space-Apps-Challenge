/** Efeitos de interface: ondulação de água no clique dos botões. */
export function instalarOndulacao() {
  if (typeof document === 'undefined' || document.__ondulacao) return;
  document.__ondulacao = true;
  document.addEventListener('pointerdown', (e) => {
    const alvo = e.target.closest('.botao, .botao-icone, .play, .chip');
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ondulacao';
    const d = Math.max(r.width, r.height) * 2.2;
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    alvo.appendChild(s);
    setTimeout(() => s.remove(), 700);
  });
}
