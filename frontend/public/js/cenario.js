/* ==========================================================================
   Simulated scenario: "what if it rains like this?" (#/vale screen).
   Combines two real inputs, the 7-day rain forecast (Open-Meteo) and the water above normal that the
   NISAR radar saw near the town in July 2026, and returns a level, what to do and, when it applies, an
   alert. It is a SIMULATION to show how the app would warn people: the thresholds below are for
   demonstration, not calibrated against real floods, and the result is not a flood forecast. The screen
   always shows the "Simulated" tag and this notice.
   ========================================================================== */
(function (WW) {
  "use strict";

  const LIMITES = { atencao: 30, alerta: 80 }; // mm in 7 days, demonstration values
  const PERTO_KM = 3;                         // same "may be affected" distance as the search
  const MENCIONA_KM = 5;
  const TESTE_MM = 150;                       // "heavy test rain" button

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mm = (v) => `${Math.round(v)} mm`;
  const km = (v) => `${v.toFixed(1)} km`;
  const dBR = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; };

  const SUGESTOES = {
    ok: [
      "Nothing to do now. Come back when the forecast changes.",
      "Keep the Defesa Civil (Civil Defense) number saved: 199.",
    ],
    warn: [
      "Follow the forecast and the Defesa Civil bulletins (199).",
      "Check whether your way to work or school runs close to the river and think of another route.",
      "Keep documents and medicines in a high place.",
    ],
    alert: [
      "Follow the Defesa Civil instructions (199). In an emergency, call 193 (fire brigade).",
      "Agree on a meeting point with your family away from the areas that flooded in July 2026.",
      "Have a way out that does not pass close to the river and keep a bag ready (documents, medicines, water, torch).",
      "If you must leave, do not cross streets or bridges with water: 30 cm of moving water can sweep a car away.",
    ],
  };

  /**
   * @param {{chuva_mm: number, cidade: string, dist_km?: number|null, data_julho?: string|null}} e
   *   chuva_mm: total rain over 7 days; dist_km: distance from the town centre to the nearest water above
   *   normal that the radar saw in July 2026 (null if none); data_julho: date of that pass.
   */
  function cenario({ chuva_mm, cidade, dist_km = null, data_julho = null }) {
    const chuva = Math.max(0, Number(chuva_mm) || 0);
    const nivel = chuva >= LIMITES.alerta ? "alert" : chuva >= LIMITES.atencao ? "warn" : "ok";
    const label = { ok: "Calm", warn: "Watch", alert: "Alert" }[nivel];
    const perto = dist_km != null && dist_km <= PERTO_KM;
    const julho = dist_km != null && dist_km <= MENCIONA_KM
      ? ` In July 2026, the NISAR radar saw water above normal ${km(dist_km)} from the town centre${data_julho ? ` (pass of ${dBR(data_julho)})` : ""}.`
      : " In July 2026, the radar saw no water above normal near the town centre (or the town is outside the observed area).";

    const abre = {
      ok: `With ${mm(chuva)} of rain in 7 days, the scenario is calm for ${cidade}.`,
      warn: `With ${mm(chuva)} of rain in 7 days, it is worth keeping watch in ${cidade}.`,
      alert: `With ${mm(chuva)} of rain in 7 days, the scenario is an alert for ${cidade}.`,
    }[nivel];

    let alerta = null;
    if (nivel === "alert" || (nivel === "warn" && perto)) {
      alerta = {
        titulo: `Simulated alert · ${cidade}`,
        texto: perto
          ? `With ${mm(chuva)} in 7 days, the areas that flooded in July 2026, ${km(dist_km)} from the town centre, need care.`
          : `Heavy rain in the scenario (${mm(chuva)} in 7 days). Follow the Defesa Civil.`,
      };
    }
    return { nivel, label, chuva_mm: chuva, frase: abre + (nivel === "ok" ? "" : julho), sugestoes: SUGESTOES[nivel].slice(), alerta };
  }

  cenario.LIMITES = LIMITES;
  cenario.TESTE_MM = TESTE_MM;
  cenario.AVISO = `Simulation to show how the app would warn people. It combines the rain forecast (Open-Meteo) with what the NISAR radar saw in July 2026. The thresholds of ${LIMITES.atencao} and ${LIMITES.alerta} mm in 7 days are for demonstration, not calibrated. It is not a flood forecast. In an emergency, call 199 (Defesa Civil) or 193 (fire brigade).`;
  WW.cenario = cenario;
})(window.WW = window.WW || {});
