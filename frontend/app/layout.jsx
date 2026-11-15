import 'leaflet/dist/leaflet.css';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/login.css';
import '@/styles/painel.css';
import '@/styles/analise.css';
import '@/styles/temas.css';
import Efeitos from '@/components/Efeitos';
import { SCRIPT_TEMA } from '@/lib/temaScript';

export const metadata = {
  title: 'Water Waltz · Vale do Taquari',
  description: 'Protótipo NASA Space Apps (Dancing with SARs) — áreas alagadas no Vale do Taquari com dados NISAR.',
};

export const viewport = { themeColor: '#142314', colorScheme: 'dark light' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} /></head>
      <body>
        <div className="grade-fundo" aria-hidden="true" />
        <Efeitos />
        {children}
      </body>
    </html>
  );
}
