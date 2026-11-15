export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} ${d
    .toISOString()
    .slice(11, 16)} UTC`;
}

export function km2(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })} km²`;
}
