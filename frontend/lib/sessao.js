/**
 * Sessão FALSA do protótipo — não há autenticação real.
 * Qualquer e-mail válido + senha com 4+ caracteres entra.
 *
 * 🔌 INTEGRAÇÃO FUTURA: substituir por um provedor de autenticação
 * (fora do escopo deste protótipo).
 */
const CHAVE = 'dws-sessao';

export function entrar(email) {
  // 🔌 INTEGRAÇÃO: `areaCadastrada` virá do perfil do usuário (área que ele pediu para monitorar)
  try { sessionStorage.setItem(CHAVE, JSON.stringify({ email, em: Date.now(), areaCadastrada: 'vale-do-taquari', boasVindas: true })); } catch {}
}
/** Marca que o pop-up de boas-vindas já foi respondido nesta sessão. */
export function boasVindasVista() {
  try { const s = sessaoAtual(); if (s) sessionStorage.setItem(CHAVE, JSON.stringify({ ...s, boasVindas: false })); } catch {}
}
export function sair() {
  try { sessionStorage.removeItem(CHAVE); } catch {}
}
export function sessaoAtual() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE)); } catch { return null; }
}
