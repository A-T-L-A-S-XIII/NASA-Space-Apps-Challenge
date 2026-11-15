/**
 * Sessão do usuário: login pela API (/api/auth/login) e validação do token (/api/auth/me).
 * O protótipo tem uma só conta, a de demonstração da equipe; o cadastro está desativado.
 *
 * Plano B: se a API estiver inacessível (rede ou timeout, nunca um 401), só o e-mail de
 * NEXT_PUBLIC_DEMO_EMAIL entra, numa sessão local marcada como offline. A senha nunca fica no frontend.
 */
import { ApiError, createApi } from '@/lib/api';
import { CIDADES } from '@/data/taquari';

const CHAVE = 'dws-sessao';
const REGIAO_PADRAO = 'vale-do-taquari';

/** E-mail da conta demo. O try cobre a versão estática (estatico/), onde `process` não existe. */
function emailDemo() {
  try { return (process.env.NEXT_PUBLIC_DEMO_EMAIL || '').trim().toLowerCase(); } catch { return ''; }
}

// cliente com o token da sessão (as demais rotas são públicas e usam o `api` padrão)
const apiAutenticada = createApi(undefined, () => sessaoAtual()?.token ?? null);

/** Área monitorada a partir da cidade do usuário. Hoje toda cidade da lista fica no Vale do Taquari. */
function regiaoDaCidade(cidade) {
  const nome = (cidade || '').trim().toLowerCase();
  return CIDADES.some((c) => c.nome.toLowerCase() === nome) ? 'vale-do-taquari' : REGIAO_PADRAO;
}

function guardar(sessao) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(sessao)); } catch {}
}

/**
 * Entra com e-mail e senha. Lança ApiError: 401 para credencial errada, 0 para API fora do ar
 * (quando o e-mail não é o da conta demo).
 */
export async function entrar(email, senha) {
  try {
    const { access_token, user } = await apiAutenticada.login(email, senha);
    guardar({
      token: access_token, offline: false, email: user.email, nome: user.name, cidade: user.city,
      em: Date.now(), areaCadastrada: regiaoDaCidade(user.city), boasVindas: true,
    });
  } catch (e) {
    const semApi = e instanceof ApiError && e.status === 0;
    if (!semApi || !emailDemo() || email.trim().toLowerCase() !== emailDemo()) throw e;
    console.warn('[sessao] API inacessível: entrando com a conta demo em modo offline.', e.detail);
    guardar({
      token: null, offline: true, email: emailDemo(), nome: null, cidade: null,
      em: Date.now(), areaCadastrada: REGIAO_PADRAO, boasVindas: true,
    });
  }
}

/**
 * Confere o token com /api/auth/me. Devolve false só quando a API recusa o token (401);
 * sessão offline ou API fora do ar contam como válidas.
 */
export async function validarSessao() {
  const s = sessaoAtual();
  if (!s) return false;
  if (s.offline) return true;
  try {
    const user = await apiAutenticada.me();
    guardar({ ...s, nome: user.name, cidade: user.city });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return false;
    console.warn('[sessao] Não foi possível validar o token agora.', e?.detail ?? e);
    return true;
  }
}

/** Marca que o pop-up de boas-vindas já foi respondido nesta sessão. */
export function boasVindasVista() {
  const s = sessaoAtual();
  if (s) guardar({ ...s, boasVindas: false });
}
/** Encerra a sessão e apaga o token. */
export function sair() {
  try { sessionStorage.removeItem(CHAVE); } catch {}
}
/** { token, offline, email, nome, cidade, areaCadastrada, boasVindas } ou null. */
export function sessaoAtual() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE)); } catch { return null; }
}
