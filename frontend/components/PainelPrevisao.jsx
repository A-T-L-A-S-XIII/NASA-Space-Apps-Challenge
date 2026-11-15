import { pct, horizonte, km2 } from '@/lib/formatar';
import Numero from './Numero';
const NIVEIS = { baixo: 'Risco baixo', moderado: 'Risco moderado', alto: 'Risco alto' };

/** Previsão (probabilidade e horizonte) + como ler a linha do tempo. */
export default function PainelPrevisao({ previsao, indice }) {
  const p = previsao.probabilidade;
  return (
    <>
      <section className="bloco revelar" style={{ '--i': 1 }}>
        <header className="bloco__cab"><span className="bloco__num">01</span><h2>Previsão</h2><span className={`tag tag--risco-${previsao.nivel}`}>{NIVEIS[previsao.nivel]}</span></header>
        <div className="previsao">
          <Numero valor={p * 100} casas={0} sufixo="%" className="previsao__valor" />
          <p>de chance de a água <em>avançar</em> além da mancha de 23/07 nas próximas <strong>{horizonte(previsao.horizonteHoras)}</strong>.</p>
        </div>
        <div className="escala-prob" style={{ '--p': `${p * 100}%`, '--a': `${previsao.intervalo[0] * 100}%`, '--b': `${previsao.intervalo[1] * 100}%` }}>
          <span className="escala-prob__faixa" /><span className="escala-prob__marca" />
          <span className="escala-prob__ticks">{[0, 25, 50, 75, 100].map((t) => <i key={t} style={{ left: `${t}%` }}>{t}</i>)}</span>
        </div>
        <p className="nota">Faixa provável: {pct(previsao.intervalo[0])} a {pct(previsao.intervalo[1])}</p>
        <dl className="linhas">
          <div><dt>Área alagada na cena</dt><dd><Numero valor={previsao.areaPorCena[indice]} sufixo=" km²" /></dd></div>
          <div><dt>Prevista em 12 dias</dt><dd>{km2(previsao.areaPorCena.at(-1))}</dd></div>
          <div><dt>Tendência</dt><dd className="sobe">subindo ↗</dd></div>
        </dl>
        <details className="porque">
          <summary>Por que essa previsão?</summary>
          <ul>{previsao.fatores.map((f) => <li key={f}>{f}</li>)}</ul>
          <p className="nota">Modelo de previsão simulado nesta demonstração.</p>
        </details>
      </section>

      <section className="bloco revelar" style={{ '--i': 2 }}>
        <header className="bloco__cab"><span className="bloco__num">02</span><h2>Como ler a linha do tempo</h2></header>
        <p>O <strong>NISAR</strong> repete cada órbita a cada 12 dias; somando as passagens ascendente e descendente, olha o vale a cada <strong>4 a 8 dias</strong> e enxerga o chão mesmo com nuvem ou à noite.</p>
        <ol className="passos">
          <li><i className="cor cor--agua" /><span><strong>11/07 e 23/07</strong> são passagens reais do satélite. O azul vivo é a água que não estava lá na primeira.</span></li>
          <li><i className="cor cor--previsto" /><span>As datas seguintes são <strong>previsões</strong>: o contorno limão mostra até onde a água pode chegar.</span></li>
          <li><i className="cor cor--mata" /><span>O mapa ilustrado foi <strong>interpretado a partir do próprio radar</strong>: rio, cidade, mata e lavoura.</span></li>
        </ol>
      </section>
    </>
  );
}
