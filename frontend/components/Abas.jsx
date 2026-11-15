'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import Icone from './Icone';

/**
 * Abas com indicador que desliza até a aba ativa.
 * Teclado: setas ←/→, Home e End trocam de aba (padrão WAI-ARIA de abas).
 * variante: 'linha' (sublinhado) | 'seletor' (pílula com fundo deslizante)
 * Use idPainel(id) no elemento do conteúdo (role="tabpanel").
 */
export function idsAbas(base, id) { return { aba: `${base}-aba-${id}`, painel: `${base}-painel-${id}` }; }

export default function Abas({ itens, ativa, aoMudar, variante = 'linha', rotulo, base }) {
  const auto = useId().replace(/:/g, '');
  const prefixo = base || auto;
  const refs = useRef({});
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = refs.current[ativa];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [ativa, itens]);

  function teclado(e) {
    const i = itens.findIndex((it) => it.id === ativa);
    const alvo = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: itens.length - 1 }[e.key];
    if (alvo === undefined) return;
    e.preventDefault();
    const prox = itens[(alvo + itens.length) % itens.length];
    aoMudar(prox.id);
    refs.current[prox.id]?.focus();
  }

  return (
    <div className={`abas abas--${variante}`} role="tablist" aria-label={rotulo} onKeyDown={teclado}>
      <span className="abas__indicador" style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} aria-hidden="true" />
      {itens.map((it) => {
        const ids = idsAbas(prefixo, it.id);
        const sel = ativa === it.id;
        return (
          <button key={it.id} ref={(el) => (refs.current[it.id] = el)} role="tab" type="button" id={ids.aba}
            aria-selected={sel} aria-controls={base ? ids.painel : undefined} tabIndex={sel ? 0 : -1}
            className={`abas__item ${sel ? 'ativa' : ''}`} onClick={() => aoMudar(it.id)}>
            {it.icone && <Icone nome={it.icone} tamanho={14} />}{it.rotulo}
          </button>
        );
      })}
    </div>
  );
}
