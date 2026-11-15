/**
 * Tema claro/escuro. Começa pelo sistema (prefers-color-scheme) e lembra a escolha.
 * O <html> recebe data-tema="escuro|claro"; cada página marca data-tela="login|painel|analise",
 * e o CSS (styles/temas.css) troca as cores só das telas que têm paleta própria.
 */
'use client';
import { useEffect, useState } from 'react';

import { CHAVE } from './temaScript';

export function temaAtual() {
  if (typeof document === 'undefined') return 'escuro';
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
}
export function definirTema(t) {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(CHAVE, t); } catch {}
  window.dispatchEvent(new CustomEvent('ww-tema', { detail: t }));
}
/** Estado do tema, sincronizado entre componentes. */
export function useTema() {
  const [tema, setTema] = useState('escuro');
  useEffect(() => {
    setTema(temaAtual());
    const ouvir = (e) => setTema(e.detail);
    window.addEventListener('ww-tema', ouvir);
    return () => window.removeEventListener('ww-tema', ouvir);
  }, []);
  return [tema, (t) => definirTema(t)];
}
/** Marca qual tela está aberta (para as paletas por tela). */
export function useTela(nome) {
  useEffect(() => {
    document.documentElement.dataset.tela = nome;
    return () => { if (document.documentElement.dataset.tela === nome) delete document.documentElement.dataset.tela; };
  }, [nome]);
}
