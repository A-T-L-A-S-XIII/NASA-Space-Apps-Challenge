/* ==========================================================================
   App: roteamento por hash, topbar compartilhada, tema e fluxo de região.
   #/login · #/cadastro · #/inicio · #/explorar[/SA[/BRA[/43[/<município>]]]] · #/vale · #/vale/dados
   As telas internas só abrem com sessão válida (/api/auth/me); um 401 volta ao login.
   ========================================================================== */
(function (WW) {
  "use strict";
  const C = window.WW_CONTENT, loc = C.user.location;
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sem storage: segue em memória */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const prefs = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  let session = null; // { user, offline } depois do login ou do /api/auth/me
  let login = null, home = null, explore = null, currentTab = null, valeView = null;

  const vLogin = WW.$("#view-login"), vMain = WW.$("#view-main");
  const tHome = WW.$("#tab-home"), tExplore = WW.$("#tab-explore"), tVale = WW.$("#tab-vale");
  const TABS = { home: tHome, explore: tExplore, vale: tVale };

  /* ---------------- tema ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const b = WW.$("#themeBtn");
    if (b) { b.innerHTML = t === "light" ? WW.icon.moon : WW.icon.sun; b.setAttribute("aria-label", t === "light" ? "Use dark theme" : "Use light theme"); }
    home && home.theme(); explore && explore.theme();
  }

  /* ---------------- topbar compartilhada ---------------- */
  function topbar() {
    WW.$("#topbar").innerHTML = `
      ${WW.brand()}
      <nav class="tabs" role="tablist" aria-label="Tabs">
        <button class="tab-btn" role="tab" id="tabbtn-home" aria-controls="tab-home" data-href="#/inicio"><span class="n">01</span>Overview</button>
        <button class="tab-btn" role="tab" id="tabbtn-explore" aria-controls="tab-explore" data-href="#/explorar"><span class="n">02</span>Explore data</button>
      </nav>
      <div class="topbar-spacer"></div>
      <div class="topbar-tools">
        ${WW.mode.selector()}
        <button class="btn btn-icon btn-ghost" id="themeBtn" type="button"></button>
        <button class="btn btn-icon btn-ghost" id="logoutBtn" type="button" aria-label="Log out" title="Log out">${WW.icon.logout}</button>
        <span class="avatar" id="avatar"></span>
      </div>`;
    WW.$$(".tab-btn").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.href === "#/explorar" && currentTab === "explore") return;
      location.hash = b.dataset.href === "#/explorar" && store.get("ww-path") ? "#/explorar/" + store.get("ww-path") : b.dataset.href;
    }));
    WW.$("#themeBtn").addEventListener("click", () => {
      const t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      prefs.set("ww-theme", t); applyTheme(t);
    });
    WW.$("#logoutBtn").addEventListener("click", async () => {
      session = null; store.del("ww-path");
      await WW.api.logout();
      location.hash = "#/login";
    });
    applyTheme(prefs.get("ww-theme") || "dark");
    WW.mode.bind(WW.$("#topbar"));
  }

  /* ---------------- modo de dados: Lite (padrão) / Aprofundado ---------------- */
  window.addEventListener("ww:mode", (e) => {
    if (currentTab === "vale") {
      valeView = null; // redesenha a tela atual do Vale no novo modo
      route();
    } else if (e.detail.mode === "aprofundado") {
      WW.toast(`In-depth mode on. The technical data and the export are in the <a href="#/vale/dados">Vale do Taquari panel</a>.`);
    }
  });

  /* ---------------- confirmação de acesso à região ---------------- */
  let fromRotation = null;
  WW.requestRegion = async function () {
    const ok = await WW.confirm({
      kicker: "Your region",
      title: `Open the data for ${loc.continent}?`,
      body: `You are about to open the <b>weather and terrain data</b> of your continent. From there, navigation goes down in scale — click each level to zoom in.`,
      path: [loc.continent, loc.countryName, loc.stateName, loc.municipalityName],
      img: "assets/img/level-continent.webp",
      confirmLabel: "Yes, open the data",
      cancelLabel: "Not now",
    });
    if (!ok) return;
    if (currentTab === "home" && home) fromRotation = home.rotation();
    location.hash = "#/explorar/SA";
  };

  /* ---------------- cidade do usuário → município e região iniciais ---------------- */
  const REGIAO_PADRAO = { region: "vale-do-taquari", regionName: "Vale do Taquari" };
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  function applyCity(user) {
    const m = (C.valeMunicipios || []).find((x) => norm(x.name) === norm(user && user.city));
    // Só há uma região monitorada: cidade fora da lista (ou sem cidade) também abre no Vale do Taquari
    Object.assign(loc, REGIAO_PADRAO);
    if (m) Object.assign(loc, { municipality: m.id, municipalityName: m.name, lon: m.lon, lat: m.lat });
    if (user && user.name) { C.user.name = user.name; C.user.initials = user.name.trim().charAt(0).toUpperCase(); }
  }

  /* ---------------- telas ---------------- */
  function showLogin(mode) {
    vMain.hidden = true; vLogin.hidden = false; vLogin.classList.add("view-enter");
    home && home.hide(); explore && explore.hide();
    if (!login) login = WW.Login(vLogin, { onEnter: enterApp, mode });
    else login.setMode(mode);
    document.title = (mode === "cadastro" ? "Create account" : "Log in") + " · Water Waltz";
  }

  function enterApp(pt, s) {
    const wipe = WW.$("#inkWipe");
    wipe.style.setProperty("--x", pt.x + "px"); wipe.style.setProperty("--y", pt.y + "px");
    wipe.classList.add("is-on");
    setTimeout(() => {
      session = s;
      location.hash = "#/inicio";
      setTimeout(() => { wipe.style.transition = "opacity 600ms ease"; wipe.style.opacity = "0"; }, 60);
      setTimeout(() => { wipe.classList.remove("is-on"); wipe.style.cssText = ""; }, 760);
    }, WW.reducedMotion() ? 10 : 820);
  }

  function ensureMain() {
    if (!vMain.dataset.ready) {
      applyCity(session.user);
      topbar();
      home = WW.Home(tHome, { content: C, onRegion: WW.requestRegion });
      explore = WW.Explore(tExplore, {
        content: C,
        onNavigate: (path) => { location.hash = "#/explorar" + (path.length ? "/" + path.join("/") : ""); },
        onRequestRegion: WW.requestRegion,
      });
      vMain.dataset.ready = "1";
    }
    const u = session.user || {};
    const av = WW.$("#avatar");
    av.textContent = (u.name || "?").trim().charAt(0).toUpperCase();
    av.title = [u.name, u.city, session.offline ? "offline" : ""].filter(Boolean).join(" · ");
    if (vMain.hidden) { vLogin.hidden = true; vMain.hidden = false; vMain.classList.add("view-enter"); if (login) { login.destroy(); login = null; vLogin.innerHTML = ""; } }
  }

  function setTab(name) {
    const changed = currentTab !== name;
    currentTab = name;
    vMain.classList.toggle("is-explore", name === "explore");
    vMain.classList.toggle("is-vale", name === "vale");
    for (const [k, el] of Object.entries(TABS)) {
      el.hidden = k !== name;
      const btn = WW.$("#tabbtn-" + k); // a aba do Vale não tem botão na topbar (acesso por links e #/vale)
      if (btn) btn.setAttribute("aria-selected", k === name);
    }
    if (changed) {
      const el = TABS[name];
      el.classList.remove("tab-enter"); void el.offsetWidth; el.classList.add("tab-enter");
    }
    if (name === "home") { explore.hide(); home.show(); }
    else if (name === "explore") { home.hide(); explore.show(); }
    else { home.hide(); explore.hide(); }
    return changed;
  }

  async function route() {
    const h = location.hash || "";
    if (h === "#/login") return showLogin("login");
    if (h === "#/cadastro") return showLogin("cadastro");
    if (!session) {
      try { session = await WW.api.me(); } catch (e) { session = null; }
      if (h !== (location.hash || "")) return; // a rota mudou enquanto a sessão era validada
    }
    if (!session) { location.hash = "#/login"; return; }
    if (h === "") { location.hash = "#/inicio"; return; }
    ensureMain();
    if (h.startsWith("#/vale")) {
      setTab("vale");
      const view = h.startsWith("#/vale/dados") ? "dados" : "home";
      if (view !== valeView) {
        valeView = view;
        (view === "dados" ? WW.ValeDados : WW.ValeHome)(tVale);
      }
      document.title = (view === "dados" ? "Detailed data" : "Vale do Taquari") + " · Water Waltz";
      return;
    }
    if (h.startsWith("#/explorar")) {
      const path = h.replace(/^#\/explorar\/?/, "").split("/").filter(Boolean);
      const changed = setTab("explore");
      store.set("ww-path", path.join("/"));
      explore.go(path, { from: changed ? (fromRotation || [100, 52, 0]) : null });
      fromRotation = null;
      document.title = "Explore data · Water Waltz";
    } else {
      setTab("home");
      document.title = "Overview · Water Waltz";
    }
  }

  window.addEventListener("hashchange", route);
  route();
})(window.WW);
