/**
 * Ilustração do login (original): gotas que quicam de onda em onda, em traço suave e fluido.
 * Cores vêm do tema (styles/temas.css: --gn-*), então o desenho muda no claro e no escuro.
 * Movimento: só as ondas respiram devagar (desligado com movimento reduzido).
 */

// gerador determinístico (mesmo desenho a cada render)
function sorteio(semente) {
  let s = semente;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Anéis concêntricos em perspectiva: traços longos, pontas arredondadas, poucas falhas. */
function Onda({ cx, cy, rx, aneis, semente, achatamento = 0.3, classe = '', fundo = false }) {
  const r = sorteio(semente);
  return (
    <g className={`gn-onda ${fundo ? 'gn-onda--fundo' : ''} ${classe}`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: aneis }, (_, i) => {
        const k = (i + 1) / aneis;
        const rr = rx * (0.2 + 0.8 * k);
        const traco = (2.5 + (1 - k) * 6 + r() * 2.5) * Math.min(1, rx / 170 + 0.4);
        const cheio = 70 + r() * 24;                      // trecho pintado (em % do contorno)
        return (
          <ellipse key={i} cx={cx} cy={cy} rx={rr} ry={rr * achatamento}
            pathLength={100} strokeDasharray={`${cheio} ${100 - cheio}`} strokeDashoffset={r() * 100}
            strokeWidth={traco} opacity={1 - k * 0.55} />
        );
      })}
    </g>
  );
}

export default function GotasNanquim() {
  // impactos: perto (embaixo, à esquerda) → longe (em cima, à direita)
  const A = { x: 250, y: 690 }, B = { x: 415, y: 470 }, C = { x: 500, y: 288 };
  const arcoAB = `M ${A.x} ${A.y - 6} C ${A.x + 8} ${A.y - 320}, ${B.x - 34} ${B.y - 350}, ${B.x} ${B.y - 4}`;
  const arcoBC = `M ${B.x} ${B.y - 4} C ${B.x + 6} ${B.y - 224}, ${C.x - 24} ${C.y - 244}, ${C.x} ${C.y - 3}`;
  const arcoSai = `M ${C.x} ${C.y - 3} C ${C.x + 4} ${C.y - 86}, ${C.x + 22} ${C.y - 134}, ${C.x + 46} ${C.y - 162}`;

  return (
    <svg className="gotas-nanquim" viewBox="0 0 600 800" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <filter id="gn-brilho" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <radialGradient id="gn-luz" cx="55%" cy="58%" r="50%">
          <stop offset="0" className="gn-luz" stopOpacity="0.55" />
          <stop offset="1" className="gn-luz" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="600" height="800" fill="url(#gn-luz)" />

      {/* ondas soltas ao fundo */}
      <Onda cx={70} cy={520} rx={150} aneis={3} semente={11} achatamento={0.26} fundo />
      <Onda cx={330} cy={300} rx={42} aneis={2} semente={5} achatamento={0.24} fundo />

      {/* impactos */}
      <Onda cx={A.x} cy={A.y} rx={300} aneis={6} semente={23} classe="gn-onda--a" />
      <Onda cx={B.x} cy={B.y} rx={165} aneis={5} semente={41} achatamento={0.28} classe="gn-onda--b" />
      <Onda cx={C.x} cy={C.y} rx={70} aneis={4} semente={67} achatamento={0.26} classe="gn-onda--c" />
      <g className="gn-centro">
        <ellipse cx={A.x} cy={A.y} rx={40} ry={11} />
        <ellipse cx={B.x} cy={B.y} rx={20} ry={6} />
        <ellipse cx={C.x} cy={C.y} rx={9} ry={2.8} />
      </g>

      {/* arcos de água: halo suave + traço contínuo que afina com a distância */}
      <g className="gn-arco" fill="none" strokeLinecap="round">
        <g filter="url(#gn-brilho)" opacity="0.35">
          <path d={arcoAB} strokeWidth="10" /><path d={arcoBC} strokeWidth="7" />
        </g>
        <path d={arcoAB} strokeWidth="5" />
        <path d={arcoBC} strokeWidth="3.5" />
        <path d={arcoSai} strokeWidth="2.4" />
        <path d={`M ${A.x - 4} ${A.y - 40} q -22 -118 -8 -226`} strokeWidth="1.2" opacity=".45" />
        <path d={`M ${B.x + 14} ${B.y - 28} q 30 -66 76 -92`} strokeWidth="1.1" opacity=".4" />
      </g>
    </svg>
  );
}
