/* ==========================================================================
   Tela de login — gradiente azul + efeito de profundidade sobre o Atlântico Norte.
   progress 0 → 1 (rolagem, setas ou cursor) percorre, nesta ordem:
   Europa (0) → meio do Atlântico Norte (0,5) → América do Norte (1).
   Movimento adaptável (WW.motion): com prefers-reduced-motion, Save-Data ou
   pouca memória, o cursor não move a cena e não há interpolação por quadro.
   Tudo o que anima usa só transform/opacity. Autenticação: POST /api/auth/login.
   ========================================================================== */
(function (WW) {
  "use strict";

  const IMG_RATIO = 2400 / 1357;
  // Posições (% da imagem do mapa) de cada parada e da camada que salta
  const ZONES = [
    { key: "eu",  label: "Europa",               c: 0.0, focus: [0.80, 0.42], layer: { x: 0.885, y: 0.36, w: 0.25 }, ripple: [0.80, 0.465] },
    { key: "mid", label: "Atlântico Norte",      c: 0.5, focus: [0.54, 0.52], layer: { x: 0.54,  y: 0.50, w: 0.22 }, ripple: [0.54, 0.528] },
    { key: "na",  label: "América do Norte",     c: 1.0, focus: [0.20, 0.50], layer: { x: 0.13,  y: 0.40, w: 0.30 }, ripple: [0.20, 0.645] },
  ];

  WW.Login = function (root, { onEnter }) {
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
              <div class="zi-hint">${WW.icon.down} ${fullMotion ? "role ou mova o cursor" : "role ou use as setas"}</div>
              ${ZONES.map((z, i) => `<div class="zi-step" data-z="${z.key}"><span class="bar"></span><b>${String(i + 1).padStart(2, "0")}</b> · ${z.label}</div>`).join("")}
            </div>

            <form class="login-card" id="loginForm" novalidate aria-labelledby="login-title">
              <p class="login-kicker">Radar NISAR · Vale do Taquari</p>
              <h1 class="login-title" id="login-title">Entre no Water Waltz</h1>
              <p class="login-sub">Acompanhe por onde a água passou na sua região, visto pelo radar NISAR.</p>
              <label class="field"><span>E-mail</span>
                <input type="email" name="email" autocomplete="username" placeholder="voce@exemplo.com" required aria-describedby="err-email">
                <span class="field-msg" id="err-email" role="alert"></span></label>
              <label class="field"><span>Senha</span>
                <span class="reveal">
                  <input type="password" name="password" autocomplete="current-password" placeholder="••••••••" required aria-describedby="err-senha">
                  <button type="button" class="reveal-btn" id="revealBtn" aria-label="Mostrar senha" aria-pressed="false">${WW.icon.eye}</button>
                </span>
                <span class="field-msg" id="err-senha" role="alert"></span></label>
              <div class="login-error" id="loginError" role="alert"></div>
              <div class="login-row">
                <label><input type="checkbox" name="remember" checked> Manter conectado</label>
                <a href="#" onclick="return false">Esqueci a senha</a>
              </div>
              <button class="btn btn-ink" type="submit">Entrar ${WW.icon.chevron}</button>
              <button class="btn btn-outline-ink" type="button" id="guestBtn">Entrar como visitante</button>
              <div class="login-foot"><span>NASA Space Apps 2026 · Dancing with the SARs</span><span class="badge-demo">mockup</span></div>
            </form>
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
      if (e.target.matches("input")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { target = WW.clamp(target + 0.25, 0, 1); kick(); }
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { target = WW.clamp(target - 0.25, 0, 1); kick(); }
    });

    /* ---------------- Formulário: validação por campo + login no backend ---------------- */
    const form = WW.$("#loginForm", root), err = WW.$("#loginError", root);
    const submit = form.querySelector('[type="submit"]');
    const errEmail = WW.$("#err-email", root), errSenha = WW.$("#err-senha", root);
    const point = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const setErr = (input, box, msg) => { box.textContent = msg; input.setAttribute("aria-invalid", msg ? "true" : "false"); };

    WW.$("#revealBtn", root).addEventListener("click", (e) => {
      const btn = e.currentTarget, show = form.password.type === "password";
      form.password.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", show);
      btn.setAttribute("aria-label", show ? "Esconder senha" : "Mostrar senha");
      btn.innerHTML = show ? WW.icon.eyeOff : WW.icon.eye;
    });
    form.email.addEventListener("input", () => setErr(form.email, errEmail, ""));
    form.password.addEventListener("input", () => setErr(form.password, errSenha, ""));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim(), pw = form.password.value;
      let bad = false;
      if (!email) { setErr(form.email, errEmail, "Informe o e-mail."); bad = true; }
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr(form.email, errEmail, "Esse e-mail não parece válido."); bad = true; }
      if (!pw) { setErr(form.password, errSenha, "Informe a senha."); bad = true; }
      if (bad) { err.textContent = "Confira os campos."; (form.querySelector('[aria-invalid="true"]') || form.email).focus(); return; }
      err.textContent = ""; submit.disabled = true; submit.textContent = "Entrando…";
      try {
        await WW.api.login(email, pw);
        onEnter(point(submit));
      } catch (ex) {
        err.textContent = ex.status === 401 ? "E-mail ou senha incorretos."
          : ex.status ? ex.message : "Não foi possível falar com o servidor. Tente entrar como visitante.";
      } finally {
        submit.disabled = false; submit.innerHTML = `Entrar ${WW.icon.chevron}`;
      }
    });
    WW.$("#guestBtn", root).addEventListener("click", (e) => { WW.api.logout(); onEnter(point(e.currentTarget)); });

    window.addEventListener("resize", layout);
    const onVis = () => { if (!document.hidden) kick(); }; // aba em segundo plano: o loop para sozinho
    document.addEventListener("visibilitychange", onVis);
    const imgs = WW.$$("img", root);
    Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(layout);
    layout();

    return { destroy() { alive = false; window.removeEventListener("resize", layout); document.removeEventListener("visibilitychange", onVis); } };
  };
})(window.WW);
