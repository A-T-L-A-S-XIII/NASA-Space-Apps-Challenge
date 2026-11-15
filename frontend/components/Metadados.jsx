import { dataCurta } from '@/lib/formatar';
export default function Metadados({ nisar, classes, limitacoes, passagens }) {
  const trilhas = passagens ? [...new Set(passagens.passagens.map((p) => p.trilha))] : [];
  const itens = [
    ['Satélite', nisar.satelite], ['Produto', nisar.produto], ['Cena antes', dataCurta(nisar.data_antes)],
    ['Cena depois', dataCurta(nisar.data_depois)], ['Fonte', nisar.fonte], ['Região', nisar.local],
    ['Classes no produto', classes.join(', ')], ['Revisita', '12 dias por órbita · 4–8 dias com as duas'],
    ...(passagens ? [
      ['Série temporal', `${passagens.passagens.length} passagens válidas · ${passagens.puladas.length} descartadas (cobertura baixa)`],
      ['Trilhas', trilhas.join(' · ')], ['Polarização', 'HH (banda L)'],
    ] : []),
  ];
  return (
    <div className="metadados">
      <dl className="metadados__lista">{itens.map(([k, v]) => <div key={k}><dt>{k}</dt><dd translate={k === 'Trilhas' ? 'no' : undefined}>{v}</dd></div>)}</dl>
      <div className="metadados__limites">
        <h3>Limitações</h3>
        <ul>{limitacoes.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
