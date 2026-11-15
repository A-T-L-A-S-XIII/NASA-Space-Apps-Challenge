'use client';
/** Link "pular para o conteúdo" (aparece ao navegar pelo teclado). Move o foco sem mudar a URL. */
export default function PularConteudo() {
  return (
    <a href="#conteudo" className="pular" onClick={(e) => { e.preventDefault(); const el = document.getElementById('conteudo'); el?.focus(); el?.scrollIntoView(); }}>
      Pular para o conteúdo
    </a>
  );
}
