// Login pela ponte do Next (lib/auth.mjs), sessão no api.js e cadastro desativado no login.js.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";
import * as ponte from "../lib/auth.mjs";

const fetchOriginal = globalThis.fetch;
const env = { ...process.env };
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = { ...env }; });

const TOKEN = "eyJ.token.secreto";
const USER = { id: 7, name: "Demo", email: "demo@waterwaltz.dev", role: "cidadao", city: "Estrela", created_at: "2026-11-15T00:00:00" };
const jsonResp = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pedido = (path, { method = "GET", body, cookie } = {}) => new Request(`http://localhost:3000${path}`, {
  method, body: body ? JSON.stringify(body) : undefined, headers: cookie ? { cookie } : {},
});

/* ------------------------------------------------------------- ponte do Next */
test("login certo: token só no cookie httpOnly; a resposta traz só nome e cidade", async () => {
  let chamada;
  globalThis.fetch = async (url, opts) => { chamada = { url, opts }; return jsonResp(200, { access_token: TOKEN, token_type: "bearer", user: USER }); };
  const r = await ponte.login(pedido("/api/auth/login", { method: "POST", body: { email: "demo@waterwaltz.dev", password: "x" } }));
  assert.equal(chamada.url, "http://localhost:8000/api/auth/login");
  assert.equal(r.status, 200);
  const texto = await r.text();
  assert.deepEqual(JSON.parse(texto), { user: { name: "Demo", city: "Estrela" } });
  assert.doesNotMatch(texto, /token/);
  const c = r.headers.get("set-cookie");
  assert.match(c, new RegExp(`^ww_token=${TOKEN.replace(/\./g, "\\.")};`));
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Max-Age=86400/);
  assert.doesNotMatch(c, /Secure/);
});

test("login: Secure em produção; sem 'Manter conectado' o cookie é de sessão", async () => {
  process.env.NODE_ENV = "production";
  globalThis.fetch = async () => jsonResp(200, { access_token: TOKEN, user: USER });
  const r = await ponte.login(pedido("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x", remember: false } }));
  const c = r.headers.get("set-cookie");
  assert.match(c, /Secure/);
  assert.doesNotMatch(c, /Max-Age/);
});

test("login errado: 401 com a mensagem em português e sem cookie", async () => {
  globalThis.fetch = async () => jsonResp(401, { detail: "E-mail ou senha incorretos" });
  const r = await ponte.login(pedido("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "errada" } }));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).detail, "E-mail ou senha incorretos.");
  assert.equal(r.headers.get("set-cookie"), null);
});

test("FastAPI inacessível: 502 (rede) ou 504 (tempo), nunca 401, com o e-mail da conta demo", async () => {
  process.env.DEMO_EMAIL = "demo@waterwaltz.dev";
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const r = await ponte.login(pedido("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
  assert.equal(r.status, 502);
  assert.equal((await r.json()).demo_email, "demo@waterwaltz.dev");
  globalThis.fetch = async () => { throw new DOMException("tempo", "TimeoutError"); };
  const t = await ponte.login(pedido("/api/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } }));
  assert.equal(t.status, 504);
});

test("me: sem cookie dá 401 (502 se o FastAPI caiu); com cookie manda Bearer; 401 do FastAPI apaga o cookie", async () => {
  globalThis.fetch = async () => jsonResp(200, { status: "ok" });
  assert.equal((await ponte.me(pedido("/api/auth/me"))).status, 401);
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.equal((await ponte.me(pedido("/api/auth/me"))).status, 502);
  let auth;
  globalThis.fetch = async (url, opts) => { auth = opts.headers.Authorization; return jsonResp(200, USER); };
  const r = await ponte.me(pedido("/api/auth/me", { cookie: `outro=1; ww_token=${TOKEN}` }));
  assert.equal(auth, `Bearer ${TOKEN}`);
  assert.deepEqual(await r.json(), { user: { name: "Demo", city: "Estrela" } });
  globalThis.fetch = async () => jsonResp(401, { detail: "Token inválido ou expirado" });
  const x = await ponte.me(pedido("/api/auth/me", { cookie: `ww_token=${TOKEN}` }));
  assert.equal(x.status, 401);
  assert.match(x.headers.get("set-cookie"), /Max-Age=0/);
});

test("logout apaga o cookie", () => {
  assert.match(ponte.logout().headers.get("set-cookie"), /^ww_token=;.*Max-Age=0/);
});

/* ------------------------------------------------------- sessão no api.js */
function loadApi(api) {
  const store = new Map(), avisos = [], pedidos = [];
  const win = {
    WW: {}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    location: { origin: "http://localhost:3000" },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    console: { warn: (m) => avisos.push(m) },
    fetch: async (url, opts) => { pedidos.push({ url, opts }); return api(url, opts); },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read("../public/js/api.js"), win, { filename: "api.js" });
  return { api: win.WW.api, store, avisos, pedidos };
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("api.js: login guarda só nome e cidade e nunca manda Authorization", async () => {
  const { api, store, pedidos } = loadApi(async () => resp(200, { user: { name: "Demo", city: "Estrela" } }));
  const s = await api.login("demo@waterwaltz.dev", "x");
  assert.deepEqual({ ...s, user: { ...s.user } }, { user: { name: "Demo", city: "Estrela" }, offline: false });
  assert.deepEqual([...store.keys()], ["ww-user"]);
  assert.ok(pedidos.every((p) => !("Authorization" in p.opts.headers)));
  // a sessão do login já vale para o me(), sem outra chamada
  await api.me();
  assert.equal(pedidos.length, 1);
});

test("api.js: servidor fora (502) deixa entrar offline só o e-mail da conta demo", async () => {
  const fora = async () => resp(502, { detail: "O servidor está fora do ar.", demo_email: "demo@waterwaltz.dev" });
  const outro = loadApi(fora);
  await assert.rejects(outro.api.login("ana@exemplo.com", "x"), { status: 502 });
  assert.equal(outro.store.size, 0);

  const demo = loadApi(fora);
  const s = await demo.api.login("Demo@WaterWaltz.dev", "qualquer");
  assert.equal(s.offline, true);
  assert.equal(demo.api.offline(), true);
  assert.equal(demo.avisos.length, 1);
});

test("api.js: 401 nunca entra offline, nem com e-mail da conta demo", async () => {
  const { api, store } = loadApi(async () => resp(401, { detail: "E-mail ou senha incorretos.", demo_email: "demo@waterwaltz.dev" }));
  await assert.rejects(api.login("demo@waterwaltz.dev", "errada"), { status: 401 });
  assert.equal(store.size, 0);
});

test("api.js: me() com 401 limpa a sessão; com 502 só mantém a sessão offline", async () => {
  const a = loadApi(async () => resp(401, { detail: "Sessão expirada. Entre de novo." }));
  a.store.set("ww-user", JSON.stringify({ name: "Demo" }));
  await assert.rejects(a.api.me(), { status: 401 });
  assert.equal(a.store.size, 0);

  const b = loadApi(async () => resp(502, { detail: "fora" }));
  await assert.rejects(b.api.me(), { status: 502 });

  const c = loadApi(async () => resp(502, { detail: "fora" }));
  c.store.set("ww-user", JSON.stringify({ name: "Conta de demonstração", city: null }));
  c.store.set("ww-offline", "1");
  assert.equal((await c.api.me()).offline, true);
});

test("api.js: logout chama a ponte e limpa a sessão local", async () => {
  const { api, store, pedidos } = loadApi(async () => resp(200, { ok: true }));
  store.set("ww-user", "{}");
  await api.logout();
  assert.equal(store.size, 0);
  assert.deepEqual(pedidos.map((p) => [p.url, p.opts.method]), [["/api/auth/logout", "POST"]]);
});

/* ------------------------------------------------- cadastro desativado */
function loadLogin() {
  const win = { WW: {} };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(read("../public/data/content.js"), win, { filename: "content.js" });
  vm.runInContext(read("../public/js/login.js"), win, { filename: "login.js" });
  return win.WW;
}

test("cadastro: valida cada campo e aceita uma cidade do Vale do Taquari", () => {
  const WW = loadLogin();
  const vazio = WW.validarCadastro({ name: "", email: "", password: "", city: "" });
  assert.deepEqual(Object.keys(vazio).sort(), ["city", "email", "name", "password"]);
  const ruim = WW.validarCadastro({ name: "Ana", email: "ana@", password: "123", city: "Porto Alegre" });
  assert.equal(ruim.email, "Esse e-mail não parece válido.");
  assert.equal(ruim.password, "A senha precisa de pelo menos 6 caracteres.");
  assert.equal(ruim.city, "Escolha uma cidade da lista.");
  assert.deepEqual({ ...WW.validarCadastro({ name: "Ana", email: "ana@exemplo.com", password: "senha123", city: "Muçum" }) }, {});
});

test("cadastro: não chama /register e mostra o aviso com role=status", () => {
  const js = read("../public/js/login.js");
  assert.doesNotMatch(js, /auth\/register/);
  assert.match(js, /role="status"/);
  assert.match(js, /O cadastro está desativado nesta demonstração\. Entre com a conta de demonstração\./);
  assert.match(js, /Protótipo de demonstração\. Use a conta da equipe ou entre como visitante\./);
});

/* ------------------------------------------------- visitante */
test("visitante: entra sem chamar o servidor e o me() não derruba a sessão", async () => {
  const { api, store, pedidos } = loadApi(async () => resp(401, { detail: "Sessão expirada. Entre de novo." }));
  const s = api.visitante();
  assert.equal(s.guest, true);
  assert.equal(s.offline, false);
  assert.equal(s.user.name, "Visitante");
  assert.equal(store.get("ww-guest"), "1");
  await api.me();
  assert.equal(pedidos.length, 0);
});

test("visitante: sobrevive a recarregar a página (nova carga do api.js)", async () => {
  const { api, store, pedidos } = loadApi(async () => resp(401, { detail: "Sessão expirada." }));
  store.set("ww-user", JSON.stringify({ name: "Visitante", city: "Lajeado" }));
  store.set("ww-guest", "1");
  const s = await api.me();
  assert.equal(s.guest, true);
  assert.equal(pedidos.length, 0);
});

test("visitante: sair limpa a marca; login de verdade também", async () => {
  const a = loadApi(async () => resp(200, { ok: true }));
  a.api.visitante();
  await a.api.logout();
  assert.equal(a.store.size, 0);

  const b = loadApi(async () => resp(200, { user: { name: "Demo", city: "Estrela" } }));
  b.api.visitante();
  const s = await b.api.login("demo@waterwaltz.dev", "x");
  assert.equal(s.guest, undefined);
  assert.equal(b.store.has("ww-guest"), false);
});

test("login.js: botão de visitante no cartão de login", () => {
  const js = read("../public/js/login.js");
  assert.match(js, /id="guestBtn"[^>]*>Entrar como visitante</);
  assert.match(js, /WW\.api\.visitante\(\)/);
});

test("nenhuma senha da conta demo no frontend", () => {
  for (const f of ["../public/js/api.js", "../public/js/login.js", "../public/js/app.js", "../.env.example"]) {
    assert.doesNotMatch(read(f), /troque-esta-senha|DEMO_USER_PASSWORD|DEMO_PASSWORD/, f);
  }
});
