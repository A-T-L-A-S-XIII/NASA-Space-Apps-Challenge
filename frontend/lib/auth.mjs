// Ponte de login entre o navegador e o FastAPI. Roda só no servidor do Next.js.
// O token JWT fica num cookie httpOnly: o JavaScript da página nunca o vê.
// Com o FastAPI inacessível, responde 502 (rede) ou 504 (tempo esgotado), nunca 401.

export const COOKIE = "ww_token";
const TIMEOUT_MS = 6000;

const apiUrl = () => (process.env.API_URL || "http://localhost:8000").replace(/\/$/, "");
const maxAge = () => Math.round(Number(process.env.JWT_EXPIRE_MINUTES || 1440) * 60);

function cookie(value, age) {
  const parts = [`${COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (age !== undefined) parts.push(`Max-Age=${age}`);
  return parts.join("; ");
}
const apagar = () => cookie("", 0);

export function lerToken(req) {
  const raw = req.headers.get("cookie") || "";
  for (const par of raw.split(";")) {
    const [k, ...v] = par.trim().split("=");
    if (k === COOKIE && v.length) return v.join("=") || null;
  }
  return null;
}

function json(status, body, setCookie) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(JSON.stringify(body), { status, headers });
}

// Só o que as telas usam; o token e o id nunca saem daqui
const publico = (u) => ({ name: u.name, city: u.city || null });

/* Chama o FastAPI. Devolve { status, data }; falha de rede vira 502 e tempo esgotado, 504. */
async function chamar(path, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const r = await fetch(apiUrl() + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  } catch (e) {
    const tempo = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      status: tempo ? 504 : 502,
      data: { detail: tempo ? `O servidor não respondeu em ${TIMEOUT_MS / 1000} s.` : "O servidor está fora do ar." },
    };
  }
}

const foraDoAr = (s) => s === 502 || s === 504;
const detalhe = (data, padrao) => (data && typeof data.detail === "string" ? data.detail : padrao);

export async function login(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return json(422, { detail: "Informe e-mail e senha." });
  }
  const r = await chamar("/api/auth/login", { method: "POST", body: { email: body.email, password: body.password } });
  if (r.status === 200 && r.data && r.data.access_token) {
    // "Manter conectado" desmarcado: cookie de sessão, some ao fechar o navegador
    const age = body.remember === false ? undefined : maxAge();
    return json(200, { user: publico(r.data.user) }, cookie(r.data.access_token, age));
  }
  if (foraDoAr(r.status)) {
    // Plano B: o navegador só deixa entrar offline este e-mail (a senha nunca vai para o frontend)
    return json(r.status, { detail: detalhe(r.data, "O servidor está fora do ar."), demo_email: process.env.DEMO_EMAIL || null });
  }
  if (r.status === 401) return json(401, { detail: "E-mail ou senha incorretos." });
  return json(r.status >= 400 ? r.status : 502, { detail: detalhe(r.data, `Erro ${r.status} do servidor.`) });
}

export async function me(req) {
  const token = lerToken(req);
  if (!token) {
    // Sem cookie é 401, mas só com o FastAPI no ar: a sessão offline (sem cookie) precisa saber que ele caiu
    const h = await chamar("/health");
    if (foraDoAr(h.status)) return json(h.status, { detail: detalhe(h.data, "O servidor está fora do ar.") });
    return json(401, { detail: "Sessão expirada. Entre de novo." });
  }
  const r = await chamar("/api/auth/me", { token });
  if (r.status === 200 && r.data) return json(200, { user: publico(r.data) });
  if (r.status === 401) return json(401, { detail: "Sessão expirada. Entre de novo." }, apagar());
  return json(r.status, { detail: detalhe(r.data, `Erro ${r.status} do servidor.`) });
}

export function logout() {
  return json(200, { ok: true }, apagar());
}
