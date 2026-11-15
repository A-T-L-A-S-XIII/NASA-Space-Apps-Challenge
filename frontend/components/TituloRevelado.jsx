'use client';
import { useEffect, useRef } from 'react';
import { revelarTitulo } from '@/lib/animacoes';

/** Título que entra palavra por palavra (SplitText). Leitores de tela recebem o texto normal. */
export default function TituloRevelado({ como: Tag = 'h1', atraso = 0, className = '', children, ...resto }) {
  const ref = useRef(null);
  useEffect(() => {
    let limpar = () => {};
    // espera as fontes para quebrar as linhas no lugar certo
    (document.fonts?.ready || Promise.resolve()).then(() => { limpar = revelarTitulo(ref.current, { atraso }); });
    return () => limpar();
  }, [atraso]);
  return <Tag ref={ref} className={className} {...resto}>{children}</Tag>;
}
