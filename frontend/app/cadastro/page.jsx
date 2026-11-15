'use client';
import { useTela } from '@/lib/tema';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CIDADES } from '@/data/taquari';
import { Marca } from '@/components/Cabecalho';
import GotasNanquim from '@/components/GotasNanquim';
import BotaoTema from '@/components/BotaoTema';
import Botao from '@/components/Botao';
import TituloRevelado from '@/components/TituloRevelado';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CAMPOS = [
  ['nome', 'Informe seu nome.'],
  ['email', 'Esse e-mail não parece válido.'],
  ['senha', 'Use pelo menos 4 caracteres.'],
  ['cidade', 'Escolha sua cidade.'],
];

/**
 * Tela de cadastro: existe para o pitch, mas NÃO cria conta (só a conta de demonstração da equipe entra).
 * Valida os campos como o login e, com tudo válido, só mostra o aviso. Não chama /api/auth/register.
 */
export default function Cadastro() {
  useTela('login');
  const [valores, setValores] = useState({ nome: '', email: '', senha: '', cidade: '' });
  const [erros, setErros] = useState({});
  const [desativado, setDesativado] = useState(false);
  const resumo = useRef(null);
  const aviso = useRef(null);
  // após um envio com erro, o foco vai para o resumo de erros (regra error-summary)
  useEffect(() => { if (Object.keys(erros).length) resumo.current?.focus(); }, [erros]);
  useEffect(() => { if (desativado) aviso.current?.focus(); }, [desativado]);

  const mudar = (campo) => (e) => setValores((v) => ({ ...v, [campo]: e.target.value }));
  const focar = (id) => (e) => { e.preventDefault(); document.getElementById(id).focus(); };

  function enviar(e) {
    e.preventDefault();
    const novos = {};
    if (!valores.nome.trim()) novos.nome = CAMPOS[0][1];
    if (!EMAIL_VALIDO.test(valores.email)) novos.email = CAMPOS[1][1];
    if (valores.senha.length < 4) novos.senha = CAMPOS[2][1];
    if (!valores.cidade) novos.cidade = CAMPOS[3][1];
    setErros(novos);
    setDesativado(!Object.keys(novos).length);
  }

  return (
    <main className="login" id="conteudo">
      <BotaoTema className="login__tema" />
      <div className="login__arte" aria-hidden="true">
        <div className="gotas-wrap"><GotasNanquim /></div>
        <div className="login__frase">
          <TituloRevelado como="h2" atraso={0.3}>A água dança <em>antes</em> de chegar.</TituloRevelado>
          <p>Radar em banda L do satélite NISAR para ver e prever enchentes, mesmo sob nuvens.</p>
        </div>
      </div>

      <form className={`login__form ${Object.keys(erros).length ? 'treme' : ''}`} onSubmit={enviar} noValidate key={JSON.stringify(erros)}>
        <Marca grande />
        <div className="revelar" style={{ '--i': 1 }}>
          <h1>Criar conta</h1>
          <p className="nota">Protótipo de demonstração. Use a conta da equipe.</p>
        </div>
        {Object.keys(erros).length > 0 && (
          <div className="resumo-erros" role="alert" tabIndex={-1} ref={resumo} aria-labelledby="titulo-erros">
            <h2 id="titulo-erros">Confira os campos</h2>
            <ul>
              {CAMPOS.filter(([id]) => erros[id]).map(([id]) => (
                <li key={id}><a href={`#${id}`} onClick={focar(id)}>{erros[id]}</a></li>
              ))}
            </ul>
          </div>
        )}
        {desativado && (
          <div className="resumo-erros resumo-erros--aviso" role="status" tabIndex={-1} ref={aviso}>
            <p>O cadastro está desativado nesta demonstração. Entre com a conta de demonstração.</p>
            <p><Link href="/">Ir para o login</Link></p>
          </div>
        )}
        <label className={`campo revelar ${erros.nome ? 'campo--erro' : ''}`} style={{ '--i': 2 }}>
          <input id="nome" type="text" value={valores.nome} onChange={mudar('nome')} placeholder=" " autoComplete="name" name="nome"
            aria-invalid={!!erros.nome} aria-describedby={erros.nome ? 'erro-nome' : undefined} />
          <span>Nome</span>
          {erros.nome && <small id="erro-nome">{erros.nome}</small>}
        </label>
        <label className={`campo revelar ${erros.email ? 'campo--erro' : ''}`} style={{ '--i': 3 }}>
          <input id="email" type="email" value={valores.email} onChange={mudar('email')} placeholder=" " autoComplete="email" name="email" spellCheck={false} autoCapitalize="none"
            aria-invalid={!!erros.email} aria-describedby={erros.email ? 'erro-email' : undefined} />
          <span>E-mail</span>
          {erros.email && <small id="erro-email">{erros.email}</small>}
        </label>
        <label className={`campo revelar ${erros.senha ? 'campo--erro' : ''}`} style={{ '--i': 4 }}>
          <input id="senha" type="password" value={valores.senha} onChange={mudar('senha')} placeholder=" " autoComplete="new-password" name="senha"
            aria-invalid={!!erros.senha} aria-describedby={erros.senha ? 'erro-senha' : undefined} />
          <span>Senha</span>
          {erros.senha && <small id="erro-senha">{erros.senha}</small>}
        </label>
        <label className={`campo revelar ${erros.cidade ? 'campo--erro' : ''}`} style={{ '--i': 5 }}>
          <select id="cidade" value={valores.cidade} onChange={mudar('cidade')} name="cidade" autoComplete="address-level2"
            aria-invalid={!!erros.cidade} aria-describedby={erros.cidade ? 'erro-cidade' : undefined}>
            <option value="">Escolha…</option>
            {CIDADES.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
          </select>
          <span>Cidade</span>
          {erros.cidade && <small id="erro-cidade">{erros.cidade}</small>}
        </label>
        <div className="revelar" style={{ '--i': 6 }}>
          <Botao type="submit" variante="cta" bloco>Criar conta</Botao>
        </div>
        <div className="revelar" style={{ '--i': 7 }}>
          <Botao href="/" variante="fantasma" icone={null} bloco>Voltar ao login</Botao>
        </div>
        <p className="login__rodape revelar" style={{ '--i': 8 }}>NASA Space Apps Challenge · equipe Dancing with SARs</p>
      </form>
    </main>
  );
}
