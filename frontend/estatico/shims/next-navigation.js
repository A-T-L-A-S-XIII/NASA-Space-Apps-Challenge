// Substitui next/navigation na versão estática
const ir = (p) => { location.hash = p === '/' ? 'login' : p.replace(/^\//, ''); };
export function useRouter() { return { push: ir, replace: ir }; }
