'use client';
import { useEffect, useRef, useState } from 'react';
import { reduzirMovimento } from '@/lib/movimento';

/** Número que "conta" até o valor quando aparece ou muda. */
export default function Numero({ valor, casas = 1, sufixo = '', prefixo = '', duracao = 900, className = '' }) {
  const [v, setV] = useState(0);
  const atual = useRef(0);
  useEffect(() => {
    if (reduzirMovimento()) { atual.current = valor; setV(valor); return; }
    const de = atual.current, t0 = performance.now();
    let raf;
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / duracao);
      const e = 1 - (1 - k) ** 3;
      const x = de + (valor - de) * e;
      atual.current = x; setV(x);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracao]);
  return <span className={className}>{prefixo}{v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}{sufixo}</span>;
}
