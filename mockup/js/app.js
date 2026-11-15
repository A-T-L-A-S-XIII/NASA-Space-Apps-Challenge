/* ==========================================================================
   App: roteamento por hash, topbar compartilhada, tema e fluxo de região.
   #/login · #/inicio · #/explorar[/SA[/BRA[/43[/<município>]]]] · #/vale · #/vale/dados
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

  let authed = store.get("ww-auth") === "1";
  let login = null, home = null, explore = null, currentTab = null, valeView = null;

  const vLogin = WW.$("#view-login"), vMain = WW.$("#view-main");
  const tHome = WW.$("#tab-home"), tExplore = WW.$("#tab-explore"), tVale = WW.$("#tab-vale");
  const TABS = { home: tHome, explore: tExplore, vale: tVale };

  /* ---------------- tema ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const b = WW.$("#themeBtn");
    if (b) { b.innerHTML = t === "light" ? WW.icon.moon : WW.icon.sun; b.setAttribute("aria-label", t === "light" ? "Usar tema escuro" : "Usar tema claro"); }
    home && home.theme(); explore && explore.theme();
  }

  /* ---------------- topbar compartilhada ---------------- */
  function topbar() {
    WW.$("#topbar").innerHTML = `
      ${WW.brand()}
      <nav class="tabs" role="tablist" aria-label="Abas">
        <button class="tab-btn" role="tab" id="tabbtn-home" aria-controls="tab-home" data-href="#/inicio"><span class="n">01</span>Visão geral</button>
        <button class="tab-btn" role="tab" id="tabbtn-explore" aria-controls="tab-explore" data-href="#/explorar"><span class="n">02</span>Explorar dados</button>
      </nav>
      <div class="topbar-spacer"></div>
      <div class="topbar-tools">
        ${WW.mode.selector()}
        <button class="btn btn-icon btn-ghost" id="themeBtn" type="button"></button>
        <button class="btn btn-icon btn-ghost" id="logoutBtn" type="button" aria-label="Sair" title="Sair">${WW.icon.logout}</button>
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
    WW.$("#logoutBtn").addEventListener("click", () => { authed = false; WW.api.logout(); store.del("ww-auth"); store.del("ww-path"); location.hash = "#/login"; });
    applyTheme(prefs.get("ww-theme") || "dark");
    WW.mode.bind(WW.$("#topbar"));
  }

  /* ---------------- modo de dados: Lite (padrão) / Aprofundado ---------------- */
  window.addEventListener("ww:mode", (e) => {
    if (currentTab === "vale") {
      valeView = null; // redesenha a tela atual do Vale no novo modo
      route();
    } else if (e.detail.mode === "aprofundado") {
      WW.toast(`Modo Aprofundado ativo. Os dados técnicos e a exportação ficam no <a href="#/vale/dados">painel do Vale do Taquari</a>.`);
    }
  });

  /* ---------------- confirmação de acesso à região ---------------- */
  let fromRotation = null;
  WW.requestRegion = async function () {
    const ok = await WW.confirm({
      kicker: "Sua região",
      title: `Acessar os dados ${loc.continentOf}?`,
      body: `Você vai abrir os <b>dados meteorológicos e topográficos</b> do seu continente. A partir daí, a navegação desce em escala — clique em cada nível para aproximar.`,
      path: [loc.continent, loc.countryName, loc.stateName, loc.municipalityName],
      img: "assets/img/level-continent.webp",
      confirmLabel: "Sim, acessar dados",
      cancelLabel: "Agora não",
    });
    if (!ok) return;
    if (currentTab === "home" && home) fromRotation = home.rotation();
    location.hash = "#/explorar/SA";
  };

  /* ---------------- telas ---------------- */
  function showLogin() {
    vMain.hidden = true; vLogin.hidden = false; vLogin.classList.add("view-enter");
    home && home.hide(); explore && explore.hide();
    if (!login) login = WW.Login(vLogin, { onEnter: enterApp });
  }

  function enterApp(pt) {
    const wipe = WW.$("#inkWipe");
    wipe.style.setProperty("--x", pt.x + "px"); wipe.style.setProperty("--y", pt.y + "px");
    wipe.classList.add("is-on");
    setTimeout(() => {
      authed = true; store.set("ww-auth", "1");
      location.hash = "#/inicio";
      setTimeout(() => { wipe.style.transition = "opacity 600ms ease"; wipe.style.opacity = "0"; }, 60);
      setTimeout(() => { wipe.classList.remove("is-on"); wipe.style.cssText = ""; }, 760);
    }, WW.reducedMotion() ? 10 : 820);
  }

  function ensureMain() {
    if (!vMain.dataset.ready) {
      topbar();
      home = WW.Home(tHome, { content: C, onRegion: WW.requestRegion });
      explore = WW.Explore(tExplore, {
        content: C,
        onNavigate: (path) => { location.hash = "#/explorar" + (path.length ? "/" + path.join("/") : ""); },
        onRequestRegion: WW.requestRegion,
      });
      vMain.dataset.ready = "1";
    }
    const u = WW.api.user();
    const av = WW.$("#avatar");
    av.textContent = u ? u.name.trim().charAt(0).toUpperCase() : "V";
    av.title = u ? `${u.name} · ${u.email}` : "Visitante";
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

  function route() {
    const h = location.hash || "";
    if (!authed || h === "#/login" || h === "") { if (authed && h === "") { location.hash = "#/inicio"; return; } return showLogin(); }
    ensureMain();
    if (h.startsWith("#/vale")) {
      setTab("vale");
      const view = h.startsWith("#/vale/dados") ? "dados" : "home";
      if (view !== valeView) {
        valeView = view;
        (view === "dados" ? WW.ValeDados : WW.ValeHome)(tVale);
      }
      document.title = (view === "dados" ? "Dados detalhados" : "Vale do Taquari") + " · Water Waltz";
      return;
    }
    if (h.startsWith("#/explorar")) {
      const path = h.replace(/^#\/explorar\/?/, "").split("/").filter(Boolean);
      const changed = setTab("explore");
      store.set("ww-path", path.join("/"));
      explore.go(path, { from: changed ? (fromRotation || [100, 52, 0]) : null });
      fromRotation = null;
      document.title = "Explorar dados · Water Waltz";
    } else {
      setTab("home");
      document.title = "Visão geral · Water Waltz";
    }
  }

  window.addEventListener("hashchange", route);
  route();
})(window.WW);
