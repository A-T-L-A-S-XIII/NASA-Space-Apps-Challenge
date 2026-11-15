import { LIMITES, ARQUIVOS } from '@/lib/nisarService';
const PROP_IMG = 2130 / 1880;
const PROP_CAIXA = 9 / 16;

/** "Imagem correspondente" do lugar: recorte do mapa interpretado (com a água nova), centrado nele. */
export default function RecorteIlustrado({ lon, lat, zoom = 3 }) {
  const fx = (lon - LIMITES.oeste) / (LIMITES.leste - LIMITES.oeste);
  const fy = (LIMITES.norte - lat) / (LIMITES.norte - LIMITES.sul);
  const estilo = { width: `${zoom * 100}%`, left: `${50 - fx * zoom * 100}%`, top: `${50 - (fy * zoom * PROP_IMG * 100) / PROP_CAIXA}%` };
  return (
    <div className="recorte">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ARQUIVOS.ilustradoDepois} alt="" style={estilo} loading="lazy" decoding="async" />
      <span className="recorte__pino" />
    </div>
  );
}
