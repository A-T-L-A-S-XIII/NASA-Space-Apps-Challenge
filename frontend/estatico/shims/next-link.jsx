// Substitui next/link na versão estática: rotas viram âncoras (#painel, #analise)
export default function Link({ href, children, ...props }) {
  const alvo = href === '/' ? '#login' : '#' + href.replace(/^\//, '');
  return <a href={alvo} {...props}>{children}</a>;
}
