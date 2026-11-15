/** true se o usuário pediu para reduzir animações no sistema (prefers-reduced-motion). */
export const reduzirMovimento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
