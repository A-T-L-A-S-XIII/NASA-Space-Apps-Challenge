/* ==========================================================================
   Cliente da API Water Waltz (FastAPI em backend/).
   Base: ?api=<url> na página, ou window.WW_API_BASE, ou http://localhost:8000.
   ========================================================================== */
(function (WW) {
  "use strict";

  const fromQuery = new URLSearchParams(location.search).get("api");
  const BASE = (fromQuery || window.WW_API_BASE || "http://localhost:8000").replace(/\/$/, "");
  const cache = new Map();
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sem storage */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* sem storage */ } },
  };

  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function request(path, { method = "GET", body, cacheable = true } = {}) {
    const key = method + path;
    if (method === "GET" && cacheable && cache.has(key)) return cache.get(key);
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    const token = ss.get("ww-token");
    if (token) headers.Authorization = "Bearer " + token;
    const p = fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new ApiError((data && data.detail && typeof data.detail === "string" ? data.detail : `Erro ${r.status}`), r.status);
        return data;
      });
    if (method === "GET" && cacheable) {
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    return p;
  }

  WW.api = {
    base: BASE,
    url: (path) => BASE + path,
    ApiError,
    get: (path, opts) => request(path, opts),
    async login(email, password) {
      const res = await request("/api/auth/login", { method: "POST", body: { email, password }, cacheable: false });
      ss.set("ww-token", res.access_token);
      ss.set("ww-user", JSON.stringify(res.user));
      return res;
    },
    logout() { ss.del("ww-token"); ss.del("ww-user"); },
    user() { try { return JSON.parse(ss.get("ww-user") || "null"); } catch (e) { return null; } },
  };
})(window.WW);
