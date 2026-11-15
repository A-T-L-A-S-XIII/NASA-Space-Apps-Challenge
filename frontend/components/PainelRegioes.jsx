'use client';
import { useState } from 'react';
import { normalizar } from '@/lib/taquari';
import Icone from './Icone';

/** Lista de regiões monitoradas, com busca. Selecionar gira o globo até a região. */
export default function PainelRegioes({ regioes, regiaoId, aberta, aoSelecionar, aoMergulhar }) {
  const [texto, setTexto] = useState('');
  const q = normalizar(texto);
  const lista = regioes.filter((r) => !q || normalizar(`${r.nome} ${r.local}`).includes(q));
  const disponiveis = regioes.filter((r) => r.status === 'disponivel').length;
  return (
    <section className="regioes" aria-labelledby="titulo-regioes">
      <header className="pagina-cab revelar"><h2 id="titulo-regioes">Regiões</h2><span className="pagina-cab__meta">{disponiveis} de {regioes.length} com cenas</span></header>
      <form className="campo-busca revelar" style={{ '--i': 2 }} role="search" onSubmit={(e) => { e.preventDefault(); if (lista[0]) aoSelecionar(lista[0].id); }}>
        <Icone nome="busca" />
        <label htmlFor="busca-regiao" className="sr-only">Buscar região</label>
        <input id="busca-regiao" type="search" placeholder="Buscar região ou cidade" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
      </form>
      <ul className="regioes__lista" role="list">
        {lista.map((r, i) => {
          const ativa = r.id === regiaoId, ok = r.status === 'disponivel';
          return (
            <li key={r.id} className="revelar" style={{ '--i': i + 3 }}>
              <button type="button" className={`regiao ${ativa ? 'regiao--ativa' : ''} ${ok ? '' : 'regiao--sem-dados'}`} onClick={() => aoSelecionar(r.id)} aria-pressed={ativa}>
                <span className={`regiao__ponto ${ok ? 'cheio' : ''}`} aria-hidden="true" />
                <span className="regiao__texto"><strong>{r.nome}</strong><small>{r.local}</small></span>
                {ok ? <span className="tag tag--azul">{aberta === r.id ? 'Aberta' : 'Pronta'}</span> : <span className="regiao__status">sem cena</span>}
              </button>
              {ativa && ok && aberta !== r.id && (
                <button type="button" className="link-acao regiao__mergulhar" onClick={aoMergulhar}>
                  Abrir {r.nome} <Icone nome="seta" tamanho={14} />
                </button>
              )}
            </li>
          );
        })}
        {lista.length === 0 && <li className="vazio">Nenhuma região encontrada para “{texto}”.</li>}
      </ul>
    </section>
  );
}
