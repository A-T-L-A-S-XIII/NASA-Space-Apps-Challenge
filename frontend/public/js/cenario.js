/* ==========================================================================
   Cenário simulado: "e se chover assim?" (tela #/vale).
   Junta dois dados reais, a chuva prevista para 7 dias (Open-Meteo) e a água fora do normal que o radar
   NISAR viu em julho de 2026 perto da cidade, e devolve um nível, sugestões e, se for o caso, um alerta.
   É uma SIMULAÇÃO para mostrar como o app avisaria: os limites abaixo são de demonstração, não foram
   calibrados com enchentes reais, e o resultado não é previsão de enchente. A tela sempre mostra o selo
   "Simulado" e esse aviso.
   ========================================================================== */
(function (WW) {
  "use strict";

  const LIMITES = { atencao: 30, alerta: 80 }; // mm em 7 dias, de demonstração
  const PERTO_KM = 3;                         // mesma régua de "pode ser afetada" da busca
  const MENCIONA_KM = 5;
  const TESTE_MM = 150;                       // botão "chuva forte de teste"

  const mm = (v) => `${Math.round(v)} mm`;
  const km = (v) => `${v.toFixed(1).replace(".", ",")} km`;
  const dBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

  const SUGESTOES = {
    ok: [
      "Nada a fazer agora. Volte aqui quando a previsão mudar.",
      "Deixe salvo o telefone da Defesa Civil: 199.",
    ],
    warn: [
      "Acompanhe a previsão e os boletins da Defesa Civil (199).",
      "Veja se o caminho até o trabalho ou a escola passa perto do rio e pense num caminho alternativo.",
      "Guarde documentos e remédios num lugar alto.",
    ],
    alert: [
      "Siga as orientações da Defesa Civil (199). Em emergência, ligue 193 (Bombeiros).",
      "Combine com a família um ponto de encontro longe das áreas que alagaram em julho de 2026.",
      "Tenha um caminho de saída que não passe perto do rio e deixe uma mochila pronta (documentos, remédios, água, lanterna).",
      "Se precisar sair, não atravesse ruas ou pontes com água: 30 cm de correnteza já arrastam um carro.",
    ],
  };

  /**
   * @param {{chuva_mm: number, cidade: string, dist_km?: number|null, data_julho?: string|null}} e
   *   chuva_mm: chuva somada de 7 dias; dist_km: distância da sede até a água fora do normal mais próxima
   *   que o radar viu em julho de 2026 (null se não viu); data_julho: data dessa passagem.
   */
  function cenario({ chuva_mm, cidade, dist_km = null, data_julho = null }) {
    const chuva = Math.max(0, Number(chuva_mm) || 0);
    const nivel = chuva >= LIMITES.alerta ? "alert" : chuva >= LIMITES.atencao ? "warn" : "ok";
    const label = { ok: "Tranquilo", warn: "Atenção", alert: "Alerta" }[nivel];
    const perto = dist_km != null && dist_km <= PERTO_KM;
    const julho = dist_km != null && dist_km <= MENCIONA_KM
      ? ` Em julho de 2026, o radar NISAR viu água fora do normal a ${km(dist_km)} da sede${data_julho ? ` (passagem de ${dBR(data_julho)})` : ""}.`
      : " Em julho de 2026, o radar não viu água fora do normal perto da sede (ou a cidade fica fora da área observada).";

    const abre = {
      ok: `Com ${mm(chuva)} de chuva em 7 dias, o cenário fica tranquilo para ${cidade}.`,
      warn: `Com ${mm(chuva)} de chuva em 7 dias, vale ficar atento em ${cidade}.`,
      alert: `Com ${mm(chuva)} de chuva em 7 dias, o cenário é de alerta para ${cidade}.`,
    }[nivel];

    let alerta = null;
    if (nivel === "alert" || (nivel === "warn" && perto)) {
      alerta = {
        titulo: `Alerta simulado · ${cidade}`,
        texto: perto
          ? `Com ${mm(chuva)} em 7 dias, as áreas que alagaram em julho de 2026, a ${km(dist_km)} da sede, merecem cuidado.`
          : `Chuva forte no cenário (${mm(chuva)} em 7 dias). Acompanhe a Defesa Civil.`,
      };
    }
    return { nivel, label, chuva_mm: chuva, frase: abre + (nivel === "ok" ? "" : julho), sugestoes: SUGESTOES[nivel].slice(), alerta };
  }

  cenario.LIMITES = LIMITES;
  cenario.TESTE_MM = TESTE_MM;
  cenario.AVISO = `Simulação para mostrar como o app avisaria. Junta a chuva prevista (Open-Meteo) com o que o radar NISAR viu em julho de 2026. Os limites de ${LIMITES.atencao} e ${LIMITES.alerta} mm em 7 dias são de demonstração, não calibrados. Não é previsão de enchente. Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).`;
  WW.cenario = cenario;
})(window.WW = window.WW || {});
