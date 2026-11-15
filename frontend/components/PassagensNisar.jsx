'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icone from '@/components/Icone';
import { asset } from '@/lib/asset';
import { reduzirMovimento } from '@/lib/movimento';

/**
 * 19 passagens reais do NISAR sobre o Vale do Taquari (jun–out 2026).
 * Cada quadro é o radar interpretado no estilo do app (água em azul, “cheia” em verde).
 * O gráfico separa as órbitas: a ascendente sempre enxerga mais água que a descendente
 * (geometria de visada diferente), então misturar as duas numa linha só criaria um falso zigue-zague.
 * 🔌 INTEGRAÇÃO: trocar `passagens` pelo catálogo vindo do pipeline a cada nova passagem.
 */
const COR = { ascendente: 'var(--serie-asc)', descendente: 'var(--serie-desc)' };   // cores do tema (validadas)
const JANELA = ['2026-07-03', '2026-08-28'];
const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dia = (s) => new Date(`${s}T12:00:00Z`);
const dataCurta = (s) => dia(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '');

export default function PassagensNisar({ dados }) {
  const lista = dados.passagens;
  const [i, setI] = useState(lista.findIndex((p) => p.data === '2026-07-23'));
  const [tocando, setTocando] = useState(false);
  const [hover, setHover] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!tocando) return undefined;
    timer.current = setInterval(() => setI((v) => (v + 1) % lista.length), reduzirMovimento() ? 1600 : 700);
    return () => clearInterval(timer.current);
  }, [tocando, lista.length]);

  const p = lista[i];
  const naJanela = p.data >= JANELA[0] && p.data <= JANELA[1];

  return (
    <div className="passagens">
      <div className="passagens__player">
        <figure className="passagens__quadro">
          {lista.map((q, k) => (
            <img key={q.n} src={asset(`/nisar/passagens/${q.img}`)} width={382} height={496} alt=""
              className={k === i ? 'visivel' : ''} loading={Math.abs(k - i) < 3 ? 'eager' : 'lazy'} decoding="async" />
          ))}
          <figcaption>
            <span className="passagens__data">{dataCurta(p.data)}</span>
            <span className="etiqueta"><i style={{ background: COR[p.orbita] }} />{p.orbita}</span>
            {naJanela && <span className="etiqueta etiqueta--janela">janela da enchente</span>}
          </figcaption>
        </figure>

        <div className="passagens__controles">
          <button type="button" className="botao-icone" onClick={() => setI((v) => (v - 1 + lista.length) % lista.length)} aria-label="Passagem anterior"><Icone nome="voltar" /></button>
          <button type="button" className="botao-icone botao-icone--grande" onClick={() => setTocando((t) => !t)} aria-label={tocando ? 'Pausar' : 'Reproduzir as 19 passagens'} aria-pressed={tocando}>
            <Icone nome={tocando ? 'pausa' : 'play'} tamanho={18} />
          </button>
          <button type="button" className="botao-icone" onClick={() => setI((v) => (v + 1) % lista.length)} aria-label="Próxima passagem"><Icone nome="seta" /></button>
          <label className="passagens__regua">
            <span className="sr-only">Escolher passagem</span>
            <input type="range" min={0} max={lista.length - 1} value={i} onChange={(e) => { setTocando(false); setI(Number(e.target.value)); }}
              aria-valuetext={`${dataCurta(p.data)}, órbita ${p.orbita}, ${fmt(p.agua_km2)} km² de água`} />
          </label>
          <span className="passagens__contador" aria-hidden="true">{String(i + 1).padStart(2, '0')}/{lista.length}</span>
        </div>

        <dl className="passagens__valores" aria-live="polite">
          <div><dt>Água na cena</dt><dd>{fmt(p.agua_km2)} km²</dd></div>
          <div><dt>Acima do normal</dt><dd className={p.cheia_km2 > 0 ? 'lima' : ''}>{fmt(p.cheia_km2)} km²</dd></div>
          <div><dt>Abaixo do normal</dt><dd>{fmt(p.seca_km2)} km²</dd></div>
        </dl>
      </div>

      <div className="passagens__grafico">
        <Grafico lista={lista} atual={i} hover={hover} setHover={setHover} aoEscolher={(k) => { setTocando(false); setI(k); }} />
        <ol className="passagens__fita" aria-label="Todas as passagens">
          {lista.map((q, k) => (
            <li key={q.n}>
              <button type="button" className={`fita__item ${k === i ? 'ativo' : ''}`} onClick={() => { setTocando(false); setI(k); }}
                aria-label={`${dataCurta(q.data)}, órbita ${q.orbita}`} aria-current={k === i ? 'true' : undefined}>
                <img src={asset(`/nisar/passagens/${q.img}`)} width={382} height={496} alt="" loading="lazy" decoding="async" />
                <span>{q.data.slice(8)}/{q.data.slice(5, 7)}</span>
              </button>
            </li>
          ))}
        </ol>
        <details className="passagens__tabela">
          <summary>Ver os números em tabela</summary>
          <table>
            <thead><tr><th scope="col">Data</th><th scope="col">Órbita</th><th scope="col">Água</th><th scope="col">Acima do normal</th><th scope="col">Abaixo do normal</th></tr></thead>
            <tbody>{lista.map((q) => <tr key={q.n}><td>{dataCurta(q.data)}</td><td>{q.orbita}</td><td>{fmt(q.agua_km2)} km²</td><td>{fmt(q.cheia_km2)} km²</td><td>{fmt(q.seca_km2)} km²</td></tr>)}</tbody>
          </table>
        </details>
        <p className="nota">
          {dados.puladas.length} outras passagens foram descartadas por cobertura baixa da área
          ({dados.puladas.map((q) => dataCurta(q.data)).join(', ')}).
        </p>
      </div>
    </div>
  );
}

function Grafico({ lista, atual, hover, setHover, aoEscolher }) {
  const ref = useRef(null);
  const [L, setL] = useState(640);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setL(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const A = L < 480 ? 240 : 280, m = { t: 28, r: L < 480 ? 84 : 92, b: 34, l: 32 };
  const x0 = dia('2026-06-12').getTime(), x1 = dia('2026-10-24').getTime();
  const x = (s) => m.l + ((dia(s).getTime() - x0) / (x1 - x0)) * (L - m.l - m.r);
  const y = (v) => A - m.b - (v / 10) * (A - m.t - m.b);
  const series = useMemo(() => ['ascendente', 'descendente'].map((o) => ({ o, pts: lista.map((p, k) => ({ ...p, k })).filter((p) => p.orbita === o) })), [lista]);
  const meses = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
  const h = hover != null ? lista[hover] : null;

  return (
    <figure className="grafico" ref={ref}>
      <figcaption className="grafico__titulo">
        Água vista em cada passagem, km²
        <span className="grafico__legenda">
          {series.map((s) => <span key={s.o}><i style={{ background: COR[s.o] }} />{s.o}</span>)}
          <span><i className="grafico__janela-chave" />janela da enchente</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Água por passagem do NISAR, separada por órbita. A órbita ascendente fica entre 7 e 9 km²; a descendente entre 1 e 5 km². A tabela abaixo traz todos os valores." onPointerLeave={() => setHover(null)}>
        <rect x={x(JANELA[0])} y={m.t - 10} width={x(JANELA[1]) - x(JANELA[0])} height={A - m.b - m.t + 10} className="grafico__janela" rx={4} />
        <text x={x(JANELA[0]) + 6} y={m.t + 2} className="grafico__rotulo-janela">janela da enchente</text>
        {[0, 5, 10].map((v) => (
          <g key={v}><line x1={m.l} x2={L - m.r} y1={y(v)} y2={y(v)} className="grafico__grade" /><text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="grafico__eixo">{v}</text></g>
        ))}
        {meses.map((s) => <text key={s} x={x(s)} y={A - 12} textAnchor="middle" className="grafico__eixo">{dia(s).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</text>)}
        <line x1={x(lista[atual].data)} x2={x(lista[atual].data)} y1={m.t - 10} y2={A - m.b} className="grafico__atual" />
        {series.map((s) => (
          <g key={s.o}>
            <polyline points={s.pts.map((p) => `${x(p.data)},${y(p.agua_km2)}`).join(' ')} fill="none" style={{ stroke: COR[s.o] }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.pts.map((p) => (
              <circle key={p.n} cx={x(p.data)} cy={y(p.agua_km2)} r={p.k === atual || p.k === hover ? 6 : 4} style={{ fill: COR[s.o], stroke: 'var(--fundo)' }} strokeWidth={2} />
            ))}
            {(() => { const u = s.pts.at(-1); return <text x={x(u.data) + 10} y={y(u.agua_km2) + 4} className="grafico__direto">{s.o}</text>; })()}
          </g>
        ))}
        {lista.map((p, k) => (
          <rect key={p.n} x={x(p.data) - 12} y={m.t - 10} width={24} height={A - m.b - m.t + 10} fill="transparent" className="grafico__alvo"
            onPointerEnter={() => setHover(k)} onClick={() => aoEscolher(k)} />
        ))}
        {h && (() => {
          const tx = Math.max(m.l, Math.min(x(h.data) + 12, L - 172));
          return (
            <g className="grafico__dica" transform={`translate(${tx},${m.t})`} pointerEvents="none">
              <rect width={168} height={66} rx={8} />
              <text x={12} y={22} className="grafico__dica-valor">{fmt(h.agua_km2)} km² de água</text>
              <text x={12} y={40}>{dataCurta(h.data)} · {h.orbita}</text>
              <text x={12} y={56}>acima do normal: {fmt(h.cheia_km2)} km²</text>
            </g>
          );
        })()}
      </svg>
    </figure>
  );
}
