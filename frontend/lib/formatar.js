const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-11-15' → '15 nov 2026' (sem problemas de fuso). */
export function dataCurta(iso, comAno = true) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}${comAno ? ' ' + a : ''}`;
}
export const km2 = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km²`;
export const pct = (v) => `${Math.round(v * 100)}%`;
export function horizonte(h) {
  return h >= 48 ? `${Math.round(h / 24)} dias` : `${h} horas`;
}
