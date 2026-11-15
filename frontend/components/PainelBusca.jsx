'use client';
import { useEffect, useState } from 'react';
import { buscarLocalidade } from '@/lib/nisarService';
import { pct, horizonte } from '@/lib/formatar';
import RecorteIlustrado from './RecorteIlustrado';
import Icone from './Icone';

export const STATUS = {
  afetada: { texto: 'Área afetada', classe: 'azul', frase: 'O NISAR detectou água nova a menos de 1,2 km da sede.' },
  risco: { texto: 'Pode ser afetada', classe: 'lima', frase: 'Há água nova a menos de 3 km e a previsão indica avanço.' },
  segura: { texto: 'Sem água nova', classe: 'neutra', frase: 'Nenhuma água nova perto da sede nesta passagem.' },
  fora: { texto: 'Fora da cena', classe: 'neutra', frase: 'Este lugar fica fora da área coberta pelas cenas NISAR desta demonstração.' },
};
const SUGESTOES = ['Lajeado', 'Estrela', 'Encantado', 'Roca Sales', 'Teutônia'];

/** Busca de municípios do Vale do Taquari. Resultados aparecem enquanto digita. */
export default function PainelBusca({ previsao, aoVerNoMapa }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  useEffect(() => {
    if (texto.trim().length < 2) { setResultados(null); return; }
    let vivo = true;
    buscarLocalidade(texto).then((r) => vivo && setResultados(r));
    return () => { vivo = false; };
  }, [texto]);

  return (
    <section className="busca" aria-labelledby="titulo-busca">
      <h2 id="titulo-busca" className="sr-only">Buscar município</h2>
      <form className="campo-busca" role="search" onSubmit={(e) => { e.preventDefault(); if (resultados?.[0] && resultados[0].status !== 'fora') aoVerNoMapa?.(resultados[0]); }}>
        <Icone nome="busca" />
        <label htmlFor="campo-busca" className="sr-only">Município</label>
        <input id="campo-busca" type="search" placeholder="Digite um município do vale" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
        <kbd>↵</kbd>
      </form>
      {resultados === null && (
        <div className="sugestoes revelar">
          <span>Experimente</span>
          {SUGESTOES.map((s) => <button key={s} type="button" className="chip" onClick={() => setTexto(s)}>{s}</button>)}
        </div>
      )}
      <p className="sr-only" role="status" aria-atomic="true">
        {resultados === null ? '' : resultados.length === 0 ? 'Nenhum município encontrado.' : `${resultados.length} ${resultados.length === 1 ? 'município encontrado' : 'municípios encontrados'}.`}
      </p>
      {resultados?.length === 0 && <p className="vazio">Nada encontrado para “{texto}”. A busca cobre os municípios do Vale do Taquari.</p>}
      <div className="resultados">
        {resultados?.map((l, i) => <Resultado key={l.nome} lugar={l} previsao={previsao} aoVerNoMapa={aoVerNoMapa} i={i} />)}
      </div>
    </section>
  );
}

function Resultado({ lugar, previsao, aoVerNoMapa, i }) {
  const s = STATUS[lugar.status];
  const prob = { afetada: previsao.probabilidade, risco: previsao.probabilidade * 0.7, segura: 0.08 }[lugar.status];
  const n = (v, c) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
  return (
    <article className="resultado revelar" style={{ '--i': i }}>
      <div className="resultado__img">
        {lugar.status === 'fora' ? <div className="recorte recorte--vazio">sem cena NISAR aqui</div> : <RecorteIlustrado lon={lugar.lon} lat={lugar.lat} />}
        <span className={`tag tag--${s.classe} resultado__tag`}>{s.texto}</span>
      </div>
      <div className="resultado__corpo">
        <h3>{lugar.nome}<small>RS</small></h3>
        <p>{s.frase}</p>
        <dl className="linhas linhas--compactas">
          <div><dt>Água nova num raio de 5 km</dt><dd>{lugar.status === 'fora' ? '—' : `${n(lugar.areaProximaKm2, 2)} km²`}</dd></div>
          <div><dt>Ponto alagado mais próximo</dt><dd>{lugar.distanciaKm == null ? '—' : `${n(lugar.distanciaKm, 1)} km`}</dd></div>
          <div><dt>Previsão</dt><dd>{prob == null ? '—' : `${pct(prob)} em ${horizonte(previsao.horizonteHoras)}`}</dd></div>
        </dl>
        {lugar.status !== 'fora' && <button type="button" className="link-acao" onClick={() => aoVerNoMapa?.(lugar)}><Icone nome="pino" tamanho={14} /> Ver no mapa <Icone nome="seta" tamanho={14} /></button>}
      </div>
    </article>
  );
}
