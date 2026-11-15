'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sair } from '@/lib/sessao';
import BotaoTema from './BotaoTema';
import { asset } from '@/lib/asset';
import Icone from './Icone';

export default function Cabecalho({ voltar, atual = 'painel' }) {
  const router = useRouter();
  return (
    <header className="cabecalho">
      <div className="cabecalho__esq">
        {voltar && <Link href={voltar} className="botao-icone" aria-label="Voltar"><Icone nome="voltar" /></Link>}
        <Marca />
      </div>
      <nav className="cabecalho__nav" aria-label="Seções">
        <Link href="/painel" className={atual === 'painel' ? 'ativo' : ''}>Monitoramento</Link>
        <Link href="/analise" className={atual === 'analise' ? 'ativo' : ''}>Análise do evento</Link>
      </nav>
      <div className="cabecalho__dir">
        <span className="status-vivo">NISAR · 1 região processada</span>
        <BotaoTema />
        <button type="button" className="link-sair" onClick={() => { sair(); router.replace('/'); }}>Sair <Icone nome="sair" tamanho={14} /></button>
      </div>
    </header>
  );
}

/** Logo vetorial (gota + ondas, nas cores do app) + nome do produto. Versão compacta no cabeçalho. */
export function Marca({ grande = false }) {
  return (
    <span className={`logo-marca ${grande ? 'logo-marca--grande' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset(grande ? '/img/logo.svg' : '/img/marca.svg')} alt="" width={grande ? 120 : 64} height={grande ? 74 : 44} className="logo-marca__img" />
      <span className="logo-marca__texto" translate="no">Water <em>Waltz</em></span>
    </span>
  );
}
