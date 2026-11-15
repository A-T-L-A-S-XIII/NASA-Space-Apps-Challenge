'use client';
import { useEffect, useRef } from 'react';
import Icone from './Icone';
import Botao from './Botao';

/**
 * Pop-up logo após o login: lembra a área cadastrada e pergunta se a pessoa quer abri-la
 * ou escolher outra. Usa <dialog> nativo (prende o foco, Esc fecha = "outra área").
 */
export default function BoasVindas({ regiao, aoAbrir, aoOutra }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const fechar = () => aoOutra();
    d?.addEventListener('cancel', fechar);
    return () => d?.removeEventListener('cancel', fechar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!regiao) return null;
  const pronta = regiao.status === 'disponivel';
  return (
    <dialog ref={ref} className="boas-vindas" aria-labelledby="bv-titulo" aria-describedby="bv-texto"
      onClick={(e) => { if (e.target === ref.current) { ref.current.close(); aoOutra(); } }}>
      <div className="boas-vindas__corpo">
        <span className="boas-vindas__icone" aria-hidden="true"><Icone nome="mira" tamanho={22} /></span>
        <span className="sobretitulo">Sua área monitorada</span>
        <h2 id="bv-titulo">Você cadastrou o <em>{regiao.nome}</em></h2>
        <p id="bv-texto">
          {regiao.local}.{' '}
          {pronta ? 'Há cenas NISAR prontas para essa área. Quer ver agora ou verificar outra área?' : 'Essa área ainda não tem cena processada. Quer verificar outra área?'}
        </p>
        <div className="boas-vindas__acoes">
          {pronta && <Botao variante="cta" icone="seta" onClick={() => { ref.current.close(); aoAbrir(); }}>Ver {regiao.nome}</Botao>}
          <Botao variante="fantasma" icone={null} onClick={() => { ref.current.close(); aoOutra(); }}>Verificar outra área</Botao>
        </div>
      </div>
    </dialog>
  );
}
