'use client';
import { useEffect } from 'react';
import { dataCurta } from '@/lib/formatar';
import Icone from './Icone';

/** Régua do tempo: cenas observadas + previsão, com play/pausa. */
export default function LinhaDoTempo({ cenas, indice, aoMudar, tocando, aoAlternar }) {
  useEffect(() => {
    if (!tocando) return;
    const t = setInterval(() => aoMudar((i) => (i + 1) % cenas.length), 1600);
    return () => clearInterval(t);
  }, [tocando, cenas.length, aoMudar]);

  const n = cenas.length - 1;
  const inicioPrev = cenas.findIndex((c) => c.tipo === 'previsto');
  const cena = cenas[indice];
  return (
    <div className="regua" role="group" aria-label="Linha do tempo">
      <button type="button" className={`play ${tocando ? 'play--ativo' : ''}`} onClick={aoAlternar} aria-label={tocando ? 'Pausar' : 'Reproduzir'}>
        <svg className="play__anel" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" /></svg>
        <Icone nome={tocando ? 'pausa' : 'play'} tamanho={16} />
      </button>
      <div className="regua__corpo">
        <div className="regua__info">
          <strong key={cena.data} className="troca">{dataCurta(cena.data)}</strong>
          <span className={`tag ${cena.tipo === 'previsto' ? 'tag--lima' : 'tag--azul'}`}>{cena.tipo === 'previsto' ? 'Previsão' : 'Observado'}</span>
          <span className="regua__rotulo">{cena.rotulo}</span>
        </div>
        <div className="regua__trilho" style={{ '--prev': `${((inicioPrev - 0.5) / n) * 100}%`, '--pos': `${(indice / n) * 100}%` }}>
          <span className="regua__previsao" aria-hidden="true" />
          <span className="regua__progresso" aria-hidden="true" />
          {cenas.map((c, i) => (
            <button key={c.data} type="button" className={`regua__marca ${i === indice ? 'ativa' : ''} ${c.tipo}`} style={{ left: `${(i / n) * 100}%` }}
              onClick={() => aoMudar(i)} aria-label={dataCurta(c.data)}>
              <span className="regua__ponto" />
              <span className="regua__data">{dataCurta(c.data, false)}</span>
            </button>
          ))}
          <span className="regua__cursor" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
