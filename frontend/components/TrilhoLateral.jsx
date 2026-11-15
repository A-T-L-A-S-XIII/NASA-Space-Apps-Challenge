'use client';
import { useRef } from 'react';
import Icone from './Icone';

/**
 * Trilho com três ícones: cada um abre uma "página" da lateral (uma por vez).
 * Padrão de abas verticais (setas ↑ ↓, Home/End). Cada ícone tem o nome escrito embaixo,
 * para ninguém precisar adivinhar.
 */
export const PAGINAS = [
  { id: 'regioes', rotulo: 'Regiões', icone: 'globo' },
  { id: 'previsao', rotulo: 'Previsão', icone: 'atividade' },
  { id: 'busca', rotulo: 'Buscar', icone: 'busca' },
];
export const idPagina = (id) => ({ aba: `trilho-aba-${id}`, painel: `trilho-painel-${id}` });

export default function TrilhoLateral({ ativa, aoMudar }) {
  const refs = useRef({});
  function teclado(e, i) {
    const mapa = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: PAGINAS.length - 1 };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    const p = PAGINAS[(mapa[e.key] + PAGINAS.length) % PAGINAS.length];
    aoMudar(p.id);
    refs.current[p.id]?.focus();
  }
  return (
    <div className="trilho" role="tablist" aria-label="Páginas do painel" aria-orientation="vertical">
      {PAGINAS.map((p, i) => {
        const sel = p.id === ativa;
        return (
          <button key={p.id} ref={(el) => { refs.current[p.id] = el; }} type="button" role="tab" id={idPagina(p.id).aba}
            aria-selected={sel} aria-controls={idPagina(p.id).painel} tabIndex={sel ? 0 : -1}
            className={`trilho__item ${sel ? 'ativo' : ''}`} onClick={() => aoMudar(p.id)} onKeyDown={(e) => teclado(e, i)}>
            <Icone nome={p.icone} tamanho={20} />
            <span>{p.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
