import { icone } from '@/lib/icones';
/** Ícone SVG (estilo Lucide). */
export default function Icone({ nome, tamanho = 16 }) {
  return <span className="icone-wrap" dangerouslySetInnerHTML={{ __html: icone(nome, tamanho) }} />;
}
