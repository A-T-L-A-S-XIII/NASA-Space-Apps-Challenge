'use client';
import { useTela } from '@/lib/tema';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { entrar } from '@/lib/sessao';
import { ApiError } from '@/lib/api';
import { Marca } from '@/components/Cabecalho';
import GotasNanquim from '@/components/GotasNanquim';
import BotaoTema from '@/components/BotaoTema';
import Botao from '@/components/Botao';
import TituloRevelado from '@/components/TituloRevelado';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Tela de login: entra com a conta de demonstração pela API (plano B offline em lib/sessao.js). */
export default function Login() {
  useTela('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const resumo = useRef(null);
  // após um envio com erro, o foco vai para o resumo de erros (regra error-summary)
  useEffect(() => { if (Object.keys(erros).length) resumo.current?.focus(); }, [erros]);

  async function enviar(e) {
    e.preventDefault();
    const novos = {};
    if (!EMAIL_VALIDO.test(email)) novos.email = 'Esse e-mail não parece válido.';
    if (senha.length < 4) novos.senha = 'Use pelo menos 4 caracteres.';
    setErros(novos);
    if (Object.keys(novos).length) return;
    setEnviando(true);
    try {
      await entrar(email, senha);
      router.push('/painel');
    } catch (err) {
      const semApi = err instanceof ApiError && err.status === 0;
      setErros({ geral: err instanceof ApiError && err.status === 401 ? 'E-mail ou senha incorretos.'
        : semApi ? 'Não foi possível conectar ao servidor. Tente de novo em instantes.'
        : 'Não foi possível entrar agora. Tente de novo.' });
      setEnviando(false);
    }
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
          <h1>Entrar</h1>
          <p className="nota">Protótipo de demonstração. Use a conta da equipe.</p>
        </div>
        {Object.keys(erros).length > 0 && (
          <div className="resumo-erros" role="alert" tabIndex={-1} ref={resumo} aria-labelledby="titulo-erros">
            <h2 id="titulo-erros">Confira os campos</h2>
            <ul>
              {erros.geral && <li>{erros.geral}</li>}
              {erros.email && <li><a href="#email" onClick={(e) => { e.preventDefault(); document.getElementById('email').focus(); }}>{erros.email}</a></li>}
              {erros.senha && <li><a href="#senha" onClick={(e) => { e.preventDefault(); document.getElementById('senha').focus(); }}>{erros.senha}</a></li>}
            </ul>
          </div>
        )}
        <label className={`campo revelar ${erros.email ? 'campo--erro' : ''}`} style={{ '--i': 2 }}>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder=" " autoComplete="email" name="email" spellCheck={false} autoCapitalize="none"
            aria-invalid={!!erros.email} aria-describedby={erros.email ? 'erro-email' : undefined} />
          <span>E-mail</span>
          {erros.email && <small id="erro-email">{erros.email}</small>}
        </label>
        <label className={`campo revelar ${erros.senha ? 'campo--erro' : ''}`} style={{ '--i': 3 }}>
          <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder=" " autoComplete="current-password" name="senha"
            aria-invalid={!!erros.senha} aria-describedby={erros.senha ? 'erro-senha' : undefined} />
          <span>Senha</span>
          {erros.senha && <small id="erro-senha">{erros.senha}</small>}
        </label>
        <div className="revelar" style={{ '--i': 4 }}>
          <Botao type="submit" variante="cta" bloco disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Botao>
        </div>
        <div className="revelar" style={{ '--i': 5 }}>
          <Botao href="/cadastro" variante="fantasma" icone={null} bloco>Criar conta</Botao>
        </div>
        <p className="login__rodape revelar" style={{ '--i': 6 }}>NASA Space Apps Challenge · equipe Dancing with SARs</p>
      </form>
    </main>
  );
}
