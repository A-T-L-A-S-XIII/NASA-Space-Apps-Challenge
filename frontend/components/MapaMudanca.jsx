'use client';
import { useState } from 'react';
import { dataCurta } from '@/lib/formatar';
import { asset } from '@/lib/asset';
import Abas from './Abas';
import Icone from './Icone';

/**
 * Mapa de mudança com slider comparativo.
 *  - "Antes × Depois": mapa interpretado do radar, sem e com a água nova
 *  - "Área alagada": só a água nova
 *  - "Radar original": as imagens NISAR (banda L, HH) para quem quiser ver o dado bruto
 */
export default function MapaMudanca({ arquivos, dataAntes, dataDepois }) {
  const [pos, setPos] = useState(50);
  const [modo, setModo] = useState('depois');
  const antes = modo === 'radar' ? arquivos.radarAntes : arquivos.ilustrado;
  const depois = { depois: [arquivos.ilustradoDepois], mascara: [asset('/nisar/mascara_lima.png')], radar: [arquivos.radarDepois, asset('/nisar/mascara_azul.png')] }[modo];
  return (
    <div className="mudanca">
      <Abas variante="seletor" rotulo="Comparação" ativa={modo} aoMudar={setModo}
        itens={[{ id: 'depois', rotulo: 'Antes × Depois' }, { id: 'mascara', rotulo: 'Área alagada' }, { id: 'radar', rotulo: 'Radar original' }]} />
      <div className="mudanca__palco">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="mudanca__camada"><img src={antes} alt="Antes" /></div>
        <div className={`mudanca__camada ${modo === 'mascara' ? 'mudanca__camada--escura' : ''}`} style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {depois.map((src) => <img key={src} src={src} alt="Depois" />)}
        </div>
        <div className="mudanca__divisor" style={{ left: `${pos}%` }} aria-hidden="true"><span><Icone nome="arrastar" tamanho={16} /></span></div>
        <span className="mudanca__rotulo mudanca__rotulo--esq">{dataCurta(dataAntes)}</span>
        <span className="mudanca__rotulo mudanca__rotulo--dir">{modo === 'mascara' ? 'Água nova' : dataCurta(dataDepois)}</span>
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="mudanca__slider"
          aria-label="Comparar antes e depois" aria-valuetext={`${100 - pos}% da imagem mostra o depois`} />
      </div>
      {/* alternativa ao arrastar: atalhos por clique (WCAG 2.5.7) */}
      <div className="mudanca__atalhos" role="group" aria-label="Atalhos do comparador">
        <button type="button" className="chip" onClick={() => setPos(100)} aria-pressed={pos === 100}>Só antes</button>
        <button type="button" className="chip" onClick={() => setPos(50)} aria-pressed={pos === 50}>Metade</button>
        <button type="button" className="chip" onClick={() => setPos(0)} aria-pressed={pos === 0}>Só depois</button>
      </div>
    </div>
  );
}
