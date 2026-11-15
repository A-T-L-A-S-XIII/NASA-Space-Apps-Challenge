// Pré-visualização estática do Water Waltz: monta as MESMAS páginas React do projeto Next.js
// com um roteador por hash (#login, #painel, #analise).
import 'leaflet/dist/leaflet.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/login.css';
import '../styles/painel.css';
import '../styles/analise.css';
import '../styles/temas.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Login from '@/app/page';
import PaginaPainel from '@/app/painel/page';
import PaginaAnalise from '@/app/analise/page';
import Efeitos from '@/components/Efeitos';

function App() {
  const ler = () => location.hash.slice(1) || 'login';
  const [rota, setRota] = useState(ler);
  useEffect(() => { const f = () => { setRota(ler()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const Pagina = { painel: PaginaPainel, analise: PaginaAnalise }[rota] || Login;
  return <><div className="grade-fundo" aria-hidden="true" /><Efeitos /><Pagina key={rota} /></>;
}
createRoot(document.getElementById('app')).render(<App />);
