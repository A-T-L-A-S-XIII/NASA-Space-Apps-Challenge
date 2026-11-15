import Icone from './Icone';

const diaMes = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '');
const NIVEL = { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto' };

/**
 * Âncora da lateral no modo regional: responde "onde estou e o que estou vendo".
 * Fica sempre visível (no celular, é o que aparece com a gaveta fechada).
 */
export default function ContextoRegiao({ regiao, cena, area, nivel, aoVoltar }) {
  const prevista = cena.tipo === 'previsto';
  return (
    <div className="contexto">
      <button type="button" className="contexto__voltar" onClick={aoVoltar}>
        <Icone nome="voltar" tamanho={14} /> Todas as regiões
      </button>
      <p className="contexto__nome"><span className="regiao__ponto cheio" aria-hidden="true" />{regiao?.nome}</p>
      <dl className="contexto__dados">
        <div><dt>Cena <span className={prevista ? 'lima' : ''}>{prevista ? 'prevista' : 'real'}</span></dt><dd>{diaMes(cena.data)}</dd></div>
        <div><dt>Água nova</dt><dd>{area.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km²</dd></div>
        <div><dt>Risco</dt><dd><span className={`contexto__risco contexto__risco--${nivel}`} aria-hidden="true" />{NIVEL[nivel] ?? nivel}</dd></div>
      </dl>
    </div>
  );
}
