'use client';
import Icone from './Icone';
import { useTema } from '@/lib/tema';

/** Alterna claro/escuro. O ícone mostra o modo para onde vai. */
export default function BotaoTema({ className = '' }) {
  const [tema, setTema] = useTema();
  const proximo = tema === 'claro' ? 'escuro' : 'claro';
  return (
    <button type="button" className={`botao-tema ${className}`} onClick={() => setTema(proximo)}
      aria-label={`Ativar modo ${proximo}`} title={`Modo ${proximo}`}>
      <Icone nome={proximo === 'claro' ? 'sol' : 'lua'} tamanho={17} />
    </button>
  );
}
