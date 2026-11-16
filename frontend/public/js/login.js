/* ==========================================================================
   Tela de login — gradiente azul + efeito de profundidade sobre o Atlântico Norte.
   progress 0 → 1 (rolagem, setas ou cursor) percorre, nesta ordem:
   Europa (0) → meio do Atlântico Norte (0,5) → América do Norte (1).
   Movimento adaptável (WW.motion): com prefers-reduced-motion, Save-Data ou
   pouca memória, o cursor não move a cena e não há interpolação por quadro.
   Tudo o que anima usa só transform/opacity. Autenticação: POST /api/auth/login (ponte do Next,
   que guarda o token num cookie httpOnly). "Entrar como visitante" abre uma sessão só no navegador,
   sem conta e sem senha (WW.api.visitante). O cartão de cadastro (#/cadastro) só valida os campos:
   o cadastro está desativado e nada é enviado.
   ========================================================================== */
(function (WW) {
  "use strict";

  const IMG_RATIO = 2400 / 1357;
  // Posições (% da imagem do mapa) de cada parada e da camada que salta
  const ZONES = [
    { key: "eu",  label: "Europe",               c: 0.0, focus: [0.80, 0.42], layer: { x: 0.885, y: 0.36, w: 0.25 }, ripple: [0.80, 0.465] },
    { key: "mid", label: "North Atlantic",       c: 0.5, focus: [0.54, 0.52], layer: { x: 0.54,  y: 0.50, w: 0.22 }, ripple: [0.54, 0.528] },
    { key: "na",  label: "North America",        c: 1.0, focus: [0.20, 0.50], layer: { x: 0.13,  y: 0.40, w: 0.30 }, ripple: [0.20, 0.645] },
  ];

  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function erroEmail(email) {
    if (!email) return "Enter your e-mail.";
    return EMAIL.test(email) ? "" : "This e-mail does not look valid.";
  }
  const limpo = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

  /* Validação por campo: devolve { campo: mensagem } só com os campos inválidos. */
  WW.validarLogin = ({ email, password }) => limpo({ email: erroEmail(email), password: password ? "" : "Enter your password." });
  WW.validarCadastro = ({ name, email, password, city }) => {
    const cidades = ((window.WW_CONTENT && window.WW_CONTENT.valeMunicipios) || []).map((m) => m.name);
    return limpo({
      name: name.length >= 2 ? "" : name ? "The name needs at least 2 letters." : "Enter your name.",
      email: erroEmail(email),
      password: !password ? "Enter your password." : password.length < 6 ? "The password needs at least 6 characters." : "",
      city: !city ? "Choose your town." : cidades.length && !cidades.includes(city) ? "Choose a town from the list." : "",
    });
  };

  WW.Login = function (root, { onEnter, mode: initial = "login" }) {
    // "full": rolagem + cursor + inclinação suavizados; "reduced": só rolagem/setas, sem interpolação
    const fullMotion = WW.motion.full();
    root.innerHTML = `
      <div class="login-scroller" id="loginScroller">
        <div class="login-track">
          <div class="login-stage" id="loginStage">
            <div class="paper" id="paper">
              <img class="paper-map" src="assets/img/login-atlantic-ink.webp" alt="" draggable="false">
              ${ZONES.map((z) => `<div class="pit" data-z="${z.key}"></div>`).join("")}
              <img class="lift" data-z="eu"  src="assets/img/layer-europe-ink.webp" alt="" draggable="false">
              <img class="lift" data-z="mid" src="assets/img/layer-midatlantic-ink.webp" alt="" draggable="false">
              <img class="lift" data-z="na"  src="assets/img/layer-northamerica-ink.webp" alt="" draggable="false">
              <svg class="arc" id="arc" preserveAspectRatio="none" aria-hidden="true"></svg>
              <span class="arc-drop" id="arcDrop" aria-hidden="true"></span>
            </div>
            <div class="paper-veil"></div>

            <div class="login-brand">${WW.brand({ variant: "dark" })}</div>

            <div class="zone-indicator" aria-hidden="true">
              <div class="zi-hint">${WW.icon.down} ${fullMotion ? "scroll or move the cursor" : "scroll or use the arrow keys"}</div>
              ${ZONES.map((z, i) => `<div class="zi-step" data-z="${z.key}"><span class="bar"></span><b>${String(i + 1).padStart(2, "0")}</b> · ${z.label}</div>`).join("")}
            </div>

            <div id="cardSlot"></div>
          </div>
        </div>
      </div>`;

    const scroller = WW.$("#loginScroller", root);
    const stage = WW.$("#loginStage", root);
    const paper = WW.$("#paper", root);
    const lifts = Object.fromEntries(WW.$$(".lift", root).map((el) => [el.dataset.z, el]));
    const pits = Object.fromEntries(WW.$$(".pit", root).map((el) => [el.dataset.z, el]));
    const steps = WW.$$(".zi-step", root);
    const arc = WW.$("#arc", root);
    const drop = WW.$("#arcDrop", root);
    let arcPath = null, arcLen = 0;

    let PW = 0, PH = 0, target = 0, cur = 0, tilt = [0, 0], tiltCur = [0, 0], raf = 0, alive = true, lastScroll = 0;

    function layout() {
      const vw = stage.clientWidth, vh = stage.clientHeight;
      const over = vw < 760 ? 1.7 : 1.22; // sobra de papel para a panorâmica
      PW = Math.max(vw, vh * IMG_RATIO) * over; PH = PW / IMG_RATIO;
      if (PH < vh * 1.08) { PH = vh * 1.08; PW = PH * IMG_RATIO; }
      paper.style.width = PW + "px"; paper.style.height = PH + "px";
      for (const z of ZONES) {
        const L = lifts[z.key];
        L.style.left = z.layer.x * PW + "px"; L.style.top = z.layer.y * PH + "px"; L.style.width = z.layer.w * PW + "px";
        const P = pits[z.key];
        P.style.left = z.layer.x * PW + "px"; P.style.top = (z.layer.y + 0.03) * PH + "px";
        P.style.width = z.layer.w * PW * 0.9 + "px"; P.style.height = z.layer.w * PW * 0.75 + "px";
      }
      // arco da gota: Europa → meio → América do Norte (como os saltos da referência)
      const pt = (p) => [p[0] * PW, p[1] * PH];
      const [a, b, c] = ZONES.map((z) => pt(z.ripple));
      const h1 = PH * 0.28, h2 = PH * 0.34;
      const d = `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${Math.min(a[1], b[1]) - h1} ${b[0]},${b[1]} Q${(b[0] + c[0]) / 2},${Math.min(b[1], c[1]) - h2} ${c[0]},${c[1]}`;
      arc.setAttribute("viewBox", `0 0 ${PW} ${PH}`);
      // trilha estática (desenhada uma vez); a gota anda por transform, sem repintar o SVG
      arc.innerHTML = `<path d="${d}"/>`;
      arcPath = arc.firstElementChild;
      arcLen = arcPath.getTotalLength();
      apply(cur);
    }

    function weight(p, c) { return WW.clamp(1 - Math.abs(p - c) / 0.5, 0, 1); }
    const smooth = (x) => x * x * (3 - 2 * x);

    function apply(p) {
      const vw = stage.clientWidth, vh = stage.clientHeight;
      // câmera: interpola o foco entre as paradas
      const fx = p < 0.5 ? WW.lerp(ZONES[0].focus[0], ZONES[1].focus[0], p * 2) : WW.lerp(ZONES[1].focus[0], ZONES[2].focus[0], (p - 0.5) * 2);
      const fy = p < 0.5 ? WW.lerp(ZONES[0].focus[1], ZONES[1].focus[1], p * 2) : WW.lerp(ZONES[1].focus[1], ZONES[2].focus[1], (p - 0.5) * 2);
      const anchorX = vw < 760 ? 0.5 : 0.38; // deixa espaço para o cartão
      let tx = vw * anchorX - fx * PW, ty = vh * 0.46 - fy * PH;
      tx = WW.clamp(tx, vw - PW, 0); ty = WW.clamp(ty, vh - PH, 0);
      paper.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotateX(${tiltCur[1]}deg) rotateY(${tiltCur[0]}deg)`;
      paper.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
      stage.style.perspectiveOrigin = `${anchorX * 100}% 48%`;
      ZONES.forEach((z, i) => {
        const w = smooth(weight(p, z.c));
        // a região salta do papel em arco (como as gotas da referência) rumo ao centro livre da tela
        const sx = tx + z.layer.x * PW, sy = ty + z.layer.y * PH;
        const dx = (vw * anchorX - sx) * w * 0.82;
        const dy = (vh * 0.5 - sy) * w * 0.82 - Math.sin(Math.PI * w) * vh * 0.05;
        lifts[z.key].style.setProperty("--dx", dx.toFixed(1) + "px");
        lifts[z.key].style.setProperty("--dy", dy.toFixed(1) + "px");
        lifts[z.key].style.setProperty("--w", w.toFixed(3));
        pits[z.key].style.setProperty("--w", (w * 0.9).toFixed(3));
        steps[i].classList.toggle("is-on", w > 0.5);
      });
      // gota percorre o arco (só transform)
      if (arcPath && arcLen) {
        const q = arcPath.getPointAtLength(arcLen * p);
        drop.style.setProperty("--x", q.x.toFixed(1) + "px");
        drop.style.setProperty("--y", q.y.toFixed(1) + "px");
      }
    }

    function tick() {
      raf = 0;
      if (!alive || document.hidden) return;
      // movimento reduzido: vai direto ao alvo, sem interpolação quadro a quadro
      cur = fullMotion ? WW.lerp(cur, target, 0.085) : target;
      tiltCur = [WW.lerp(tiltCur[0], tilt[0], 0.08), WW.lerp(tiltCur[1], tilt[1], 0.08)];
      apply(cur);
      if (Math.abs(cur - target) > 0.0005 || Math.abs(tiltCur[0] - tilt[0]) > 0.01 || Math.abs(tiltCur[1] - tilt[1]) > 0.01) raf = requestAnimationFrame(tick);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    // Rolagem → progresso
    scroller.addEventListener("scroll", () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      target = max > 0 ? scroller.scrollTop / max : 0;
      lastScroll = performance.now();
      kick();
    }, { passive: true });

    // Cursor → progresso (direita = Europa, esquerda = América do Norte) + leve inclinação
    stage.addEventListener("pointermove", (e) => {
      if (!fullMotion || e.pointerType !== "mouse") return; // com movimento reduzido o cursor não move a cena
      if (e.target.closest(".login-card")) return; // não mexe enquanto o usuário digita
      const nx = e.clientX / innerWidth, ny = e.clientY / innerHeight;
      // logo após uma rolagem o cursor só inclina o papel, sem disputar a posição
      if (performance.now() - lastScroll > 1200) target = WW.clamp((1 - nx - 0.12) / 0.76, 0, 1);
      tilt = [(nx - 0.5) * 5, (0.5 - ny) * 4];
      kick();
    });

    // Teclado: setas também navegam pelas paradas
    root.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { target = WW.clamp(target + 0.25, 0, 1); kick(); }
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { target = WW.clamp(target - 0.25, 0, 1); kick(); }
    });

    /* ---------------- Cartões: login (POST /api/auth/login) e cadastro (desativado) ---------------- */
    const slot = WW.$("#cardSlot", root);
    const point = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const setErr = (input, box, msg) => { box.textContent = msg; input.setAttribute("aria-invalid", msg ? "true" : "false"); };
    const foot = `<div class="login-foot"><span>NASA Space Apps 2026 · Dancing with the SARs</span><span class="badge-demo">prototype</span></div>`;
    const senha = (autocomplete, extra = "") => `
      <label class="field"><span>Password</span>
        <span class="reveal">
          <input type="password" name="password" autocomplete="${autocomplete}" placeholder="••••••••" required aria-describedby="err-senha${extra ? " dica-senha" : ""}">
          <button type="button" class="reveal-btn" data-reveal aria-label="Show password" aria-pressed="false">${WW.icon.eye}</button>
        </span>
        ${extra}
        <span class="field-msg" id="err-senha" role="alert"></span></label>`;

    function bindReveal(form) {
      form.querySelector("[data-reveal]").addEventListener("click", (e) => {
        const btn = e.currentTarget, show = form.password.type === "password";
        form.password.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show);
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.innerHTML = show ? WW.icon.eyeOff : WW.icon.eye;
      });
    }

    // Marca cada campo; devolve true se houver erro (o foco vai para o primeiro campo inválido)
    function mark(form, erros, boxes, err) {
      for (const [nome, box] of Object.entries(boxes)) setErr(form[nome], box, erros[nome] || "");
      if (!Object.keys(erros).length) return false;
      err.textContent = "Check the fields.";
      (form.querySelector('[aria-invalid="true"]') || form.elements[0]).focus();
      return true;
    }

    function cardLogin() {
      slot.innerHTML = `
        <form class="login-card" id="loginForm" novalidate aria-labelledby="login-title">
          <p class="login-kicker">Radar NISAR · Vale do Taquari</p>
          <h1 class="login-title" id="login-title" tabindex="-1">Log in to Water Waltz</h1>
          <p class="login-sub">Follow where water went in your region, as seen by the NISAR radar.</p>
          <label class="field"><span>E-mail</span>
            <input type="email" name="email" autocomplete="username" placeholder="you@example.com" required aria-describedby="err-email">
            <span class="field-msg" id="err-email" role="alert"></span></label>
          ${senha("current-password")}
          <div class="login-error" id="loginError" role="alert" tabindex="-1"></div>
          <div class="login-row">
            <label><input type="checkbox" name="remember" checked> Keep me signed in</label>
            <a href="#" onclick="return false">Forgot password</a>
          </div>
          <button class="btn btn-ink" type="submit">Log in ${WW.icon.chevron}</button>
          <button class="btn btn-outline-ink" type="button" id="guestBtn">Continue as guest</button>
          <p class="login-note">Demo prototype. Use the team account or continue as a guest.</p>
          <a class="btn btn-outline-ink" href="#/cadastro">Create account</a>
          ${foot}
        </form>`;
      const form = WW.$("#loginForm", root), err = WW.$("#loginError", root);
      const submit = form.querySelector('[type="submit"]');
      const boxes = { email: WW.$("#err-email", root), password: WW.$("#err-senha", root) };
      bindReveal(form);
      for (const n of Object.keys(boxes)) form[n].addEventListener("input", () => setErr(form[n], boxes[n], ""));

      // Visitante: sem conta e sem senha; não chama o servidor
      const guest = WW.$("#guestBtn", root);
      guest.addEventListener("click", () => onEnter(point(guest), WW.api.visitante()));

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = form.email.value.trim(), pw = form.password.value;
        if (mark(form, WW.validarLogin({ email, password: pw }), boxes, err)) return;
        err.textContent = ""; submit.disabled = true; submit.textContent = "Entrando…";
        try {
          const sessao = await WW.api.login(email, pw, form.remember.checked);
          onEnter(point(submit), sessao);
        } catch (ex) {
          err.textContent = ex.status === 401 ? "Wrong e-mail or password."
            : ex.status === 502 || ex.status === 504 || !ex.status ? "Could not reach the server. Log in with the demo account."
            : ex.message;
          err.focus();
        } finally {
          submit.disabled = false; submit.innerHTML = `Log in ${WW.icon.chevron}`;
        }
      });
      return form;
    }

    function cardCadastro() {
      const cidades = (window.WW_CONTENT.valeMunicipios || []).map((m) => `<option value="${WW.esc(m.name)}">${WW.esc(m.name)}</option>`).join("");
      slot.innerHTML = `
        <form class="login-card" id="signupForm" novalidate aria-labelledby="signup-title">
          <p class="login-kicker">Radar NISAR · Vale do Taquari</p>
          <h1 class="login-title" id="signup-title" tabindex="-1">Create your account</h1>
          <p class="login-sub">Follow the water in your town in the Vale do Taquari.</p>
          <label class="field"><span>Name</span>
            <input type="text" name="name" autocomplete="name" placeholder="Your name" required aria-describedby="err-nome">
            <span class="field-msg" id="err-nome" role="alert"></span></label>
          <label class="field"><span>E-mail</span>
            <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required aria-describedby="err-email">
            <span class="field-msg" id="err-email" role="alert"></span></label>
          ${senha("new-password", `<span class="field-hint" id="dica-senha">At least 6 characters.</span>`)}
          <label class="field"><span>Town</span>
            <select name="city" required aria-describedby="err-cidade">
              <option value="">Choose your town</option>${cidades}
            </select>
            <span class="field-msg" id="err-cidade" role="alert"></span></label>
          <div class="login-error" id="signupError" role="alert"></div>
          <div class="login-status" id="signupStatus" role="status" tabindex="-1"></div>
          <button class="btn btn-ink" type="submit">Create account ${WW.icon.chevron}</button>
          <a class="btn btn-outline-ink" href="#/login">I already have access: log in</a>
          ${foot}
        </form>`;
      const form = WW.$("#signupForm", root), err = WW.$("#signupError", root), status = WW.$("#signupStatus", root);
      const boxes = { name: WW.$("#err-nome", root), email: WW.$("#err-email", root), password: WW.$("#err-senha", root), city: WW.$("#err-cidade", root) };
      bindReveal(form);
      for (const n of Object.keys(boxes)) {
        form[n].addEventListener(n === "city" ? "change" : "input", () => { setErr(form[n], boxes[n], ""); status.textContent = ""; });
      }

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        status.textContent = "";
        const dados = { name: form.name.value.trim(), email: form.email.value.trim(), password: form.password.value, city: form.city.value };
        if (mark(form, WW.validarCadastro(dados), boxes, err)) return;
        err.textContent = "";
        // Cadastro desativado nesta demonstração: nada é enviado (nenhum POST /register)
        status.innerHTML = `Sign-up is disabled in this demo. Log in with the demo account or continue as a guest. <a href="#/login">Go to log in</a>`;
        status.focus();
      });
      return form;
    }

    let mode = null;
    function setMode(m, { focus = true } = {}) {
      if (m === mode) return;
      mode = m;
      (m === "cadastro" ? cardCadastro : cardLogin)();
      if (focus) WW.$(".login-title", root).focus();
    }
    setMode(initial === "cadastro" ? "cadastro" : "login", { focus: false });

    window.addEventListener("resize", layout);
    const onVis = () => { if (!document.hidden) kick(); }; // aba em segundo plano: o loop para sozinho
    document.addEventListener("visibilitychange", onVis);
    const imgs = WW.$$("img", root);
    Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(layout);
    layout();

    return { setMode, destroy() { alive = false; window.removeEventListener("resize", layout); document.removeEventListener("visibilitychange", onVis); } };
  };
})(window.WW);
