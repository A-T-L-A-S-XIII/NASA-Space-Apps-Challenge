/**
 * Caminho de arquivos estáticos. No Next.js os arquivos ficam em /public (caminho absoluto);
 * na pré-visualização estática (estatico/) eles são relativos à página.
 */
export const asset = (p) => (typeof window !== 'undefined' && window.__ESTATICO__ ? p.replace(/^\//, '') : p);
