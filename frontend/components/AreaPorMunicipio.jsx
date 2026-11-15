'use client';
import { useEffect, useRef, useState } from 'react';

/** Ranking: área alagada por município (aproximação pela sede mais próxima). As barras crescem ao entrar na tela. */
export default function AreaPorMunicipio({ linhas, total }) {
  const ref = useRef(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const max = Math.max(...linhas.map((l) => l.areaKm2));
  const f = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div>
      <ol ref={ref} className={`ranking ${visivel ? 'ranking--visivel' : ''}`}>
        {linhas.map((l, i) => (
          <li key={l.municipio} className="revelar" style={{ '--i': i }}>
            <span className="ranking__pos">{String(i + 1).padStart(2, '0')}</span>
            <span className="ranking__nome">{l.municipio}</span>
            <span className="ranking__barra"><span style={{ '--w': `${(l.areaKm2 / max) * 100}%`, transitionDelay: `${i * 70}ms` }} /></span>
            <span className="ranking__valor">{f(l.areaKm2)} km²</span>
            <span className="ranking__pct">{((l.areaKm2 / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
            <span className="ranking__poli">{l.poligonos} polígonos</span>
          </li>
        ))}
      </ol>
      <p className="nota">
        Calculado a partir dos 134 polígonos reais do GeoJSON, cada um atribuído à sede municipal mais próxima.
        {/* 🔌 INTEGRAÇÃO: trocar pela interseção com a malha municipal do IBGE */}
        {' '}Na versão final o cruzamento usa os limites municipais do IBGE.
      </p>
    </div>
  );
}
