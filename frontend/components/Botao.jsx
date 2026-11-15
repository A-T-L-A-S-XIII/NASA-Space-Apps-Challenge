import Link from 'next/link';
import Icone from './Icone';

/** Botão com preenchimento em onda no hover e seta que gira. */
export default function Botao({ href, onClick, children, variante = 'cta', icone = 'seta', bloco = false, download, type = 'button', className = '', disabled, magnetico: _semEfeito }) {
  const extra = {};
  const cls = `botao botao--${variante} ${bloco ? 'botao--bloco' : ''} ${className}`;
  const miolo = (
    <>
      <span className="botao__texto">{children}</span>
      {icone && <span className="botao__seta"><Icone nome={icone} tamanho={15} /></span>}
    </>
  );
  if (download) return <a href={href} download={download} className={cls} {...extra}>{miolo}</a>;
  if (href) return <Link href={href} className={cls} {...extra}>{miolo}</Link>;
  return <button type={type} onClick={onClick} className={cls} disabled={disabled} {...extra}>{miolo}</button>;
}
