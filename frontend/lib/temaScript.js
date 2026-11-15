/** Script do <head>: aplica o tema antes da primeira pintura (sem piscar). Sem React: pode ir no layout do servidor. */
export const CHAVE = 'ww-tema';
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CHAVE}');if(t!=='claro'&&t!=='escuro')t=matchMedia('(prefers-color-scheme: light)').matches?'claro':'escuro';document.documentElement.dataset.tema=t}catch(e){document.documentElement.dataset.tema='escuro'}`;
