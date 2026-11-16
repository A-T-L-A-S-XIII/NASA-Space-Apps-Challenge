/* ==========================================================================
   Modos de dados (Lite / Aprofundado), política de movimento e exportação.
   - WW.motion: decide quanto o app anima (full | reduced) a partir de
     prefers-reduced-motion, Save-Data e memória do aparelho.
   - WW.mode:   modo de dados da conta. "lite" é o padrão; "aprofundado"
     mostra a interface técnica. Mesmo login, troca por um seletor.
   - WW.exportData: monta o pacote de pesquisa (JSON/CSV) só com dados
     públicos do radar. Nunca recebe nem grava dados do usuário.
   Sem dependência de DOM nas partes puras, para rodar nos testes (node --test).
   ========================================================================== */
(function (WW) {
  "use strict";

  const g = typeof window !== "undefined" ? window : globalThis;
  const store = {
    get(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { g.localStorage.setItem(k, v); } catch (e) { /* sem storage: fica só nesta sessão */ } },
  };

  /* ---------------------------------------------------------------- movimento */
  WW.motion = {
    level() {
      const mq = (q) => { try { return !!(g.matchMedia && g.matchMedia(q).matches); } catch (e) { return false; } };
      if (mq("(prefers-reduced-motion: reduce)")) return "reduced";
      const nav = g.navigator || {};
      if (nav.connection && nav.connection.saveData) return "reduced";
      if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return "reduced";
      return "full";
    },
    full() { return WW.motion.level() === "full"; },
  };
  // Mantém a API antiga usada pelos componentes
  WW.reducedMotion = () => !WW.motion.full();

  /* -------------------------------------------------------------------- modos */
  const MODES = ["lite", "aprofundado"];
  let current = null;
  WW.mode = {
    MODES,
    KEY: "ww-mode",
    get() {
      if (current) return current;
      const saved = store.get(WW.mode.KEY);
      current = MODES.includes(saved) ? saved : "lite";
      return current;
    },
    set(m) {
      if (!MODES.includes(m)) throw new Error(`Invalid mode: ${m}`);
      const changed = m !== WW.mode.get();
      current = m;
      store.set(WW.mode.KEY, m);
      if (g.document && g.document.documentElement) g.document.documentElement.setAttribute("data-mode", m);
      if (changed && g.dispatchEvent && typeof g.CustomEvent === "function") g.dispatchEvent(new g.CustomEvent("ww:mode", { detail: { mode: m } }));
      return changed;
    },
    isDeep() { return WW.mode.get() === "aprofundado"; },
    /* Seletor simples (segmentado) para a topbar */
    selector() {
      const m = WW.mode.get();
      return `<div class="mode-switch" role="radiogroup" aria-label="Data mode">
        <button type="button" role="radio" data-mode="lite" aria-checked="${m === "lite"}" title="Everyday interface">Lite</button>
        <button type="button" role="radio" data-mode="aprofundado" aria-checked="${m === "aprofundado"}" title="Technical interface, with more data, for studies">In-depth</button>
      </div>`;
    },
    bind(root) {
      root.addEventListener("click", (e) => {
        const b = e.target.closest(".mode-switch [data-mode]");
        if (b) WW.mode.set(b.dataset.mode);
      });
      root.addEventListener("keydown", (e) => {
        const b = e.target.closest(".mode-switch [data-mode]");
        if (!b || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        WW.mode.set(b.dataset.mode === "lite" ? "aprofundado" : "lite");
        const next = root.querySelector(`.mode-switch [data-mode="${WW.mode.get()}"]`);
        if (next) next.focus();
      });
      g.addEventListener("ww:mode", () => {
        root.querySelectorAll(".mode-switch [data-mode]").forEach((el) => el.setAttribute("aria-checked", el.dataset.mode === WW.mode.get()));
      });
    },
  };

  /* --------------------------------------------------------------- exportação */
  const FONTE = "NASA/ISRO NISAR via ASF DAAC · processamento Water Waltz";
  const AVISO = "Candidate water-change indicator from radar — not a validated flood map.";
  const csvCell = (v) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCSV = (cols, rows) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

  const PASS_COLS = ["n", "data", "trilha", "pol", "passagens_na_orbita", "agua_km2", "cheia_km2", "seca_km2", "na_janela_da_enchente", "granulo", "fonte"];
  const POLY_COLS = ["data", "trilha", "classe", "area_m2", "centroide_lat", "centroide_lon", "municipio"];

  /**
   * Monta o pacote de dados do modo Aprofundado.
   * @param {object} d  { passagens, poligonos, municipios, metadados, mes }
   * @param {"json"|"csv-passagens"|"csv-poligonos"} formato
   * @returns {{ filename: string, mime: string, content: string }}
   * Só lê os campos listados abaixo; qualquer outro campo (ex.: usuário, token) é ignorado.
   */
  WW.exportData = function (d, formato, agora = new Date()) {
    const passagens = (d.passagens || []).map((p) => Object.fromEntries(PASS_COLS.map((c) => [c, p[c] ?? null])));
    const poligonos = (d.poligonos || []).map((p) => Object.fromEntries(POLY_COLS.map((c) => [c, p[c] ?? null])));
    const tag = d.mes || "todas";
    if (formato === "csv-passagens") {
      return { filename: `water-waltz_passagens_${tag}.csv`, mime: "text/csv;charset=utf-8", content: toCSV(PASS_COLS, passagens) };
    }
    if (formato === "csv-poligonos") {
      return { filename: `water-waltz_poligonos_${tag}.csv`, mime: "text/csv;charset=utf-8", content: toCSV(POLY_COLS, poligonos) };
    }
    if (formato !== "json") throw new Error(`Invalid format: ${formato}`);
    const municipios = (d.municipios || []).map((m) => ({ id: m.id, nome: m.nome, cheia_km2: m.cheia_km2, seca_km2: m.seca_km2, toca_area_coberta: m.toca_area_coberta }));
    const meta = d.metadados || {};
    const body = {
      schema: "water-waltz/pacote-pesquisa@1",
      gerado_em: agora.toISOString(),
      local: meta.local || "Vale do Taquari (RS)",
      recorte: d.mes ? { mes: d.mes } : { periodo: meta.periodo || null },
      fonte: FONTE,
      aviso: AVISO,
      citacao: `Water Waltz (2026). Passagens NISAR processadas sobre o Vale do Taquari. Dados: ${FONTE}.`,
      privacidade: "This file holds only public radar data. No data from your account (name, e-mail, searches or token) is included.",
      crs: "EPSG:4326 (WGS 84, graus)",
      unidades: { area: "km² (polygons in m²)", coordenadas: "decimal degrees" },
      metadados: {
        satelite: meta.satelite, produto: meta.produto, banda: meta.banda, polarizacao: meta.polarizacao,
        area_coberta: meta.area_coberta, trilhas: meta.trilhas, janela_da_enchente: meta.janela_da_enchente,
        cuidados: meta.cuidados, municipios_fonte: meta.municipios_fonte,
      },
      passagens, poligonos, municipios,
    };
    return { filename: `water-waltz_pacote-pesquisa_${tag}.json`, mime: "application/json;charset=utf-8", content: JSON.stringify(body, null, 2) };
  };

  /* Dispara o download no navegador (Blob local; nada é enviado a servidor) */
  WW.downloadFile = function ({ filename, mime, content }) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (g.document && g.document.documentElement) g.document.documentElement.setAttribute("data-mode", WW.mode.get());
})(typeof window !== "undefined" ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
