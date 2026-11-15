'use client';
import { useTela } from '@/lib/tema';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtegerRota from '@/components/ProtegerRota';
import Cabecalho from '@/components/Cabecalho';
import PalcoMapa from '@/components/PalcoMapa';
import LinhaDoTempo from '@/components/LinhaDoTempo';
import PainelPrevisao from '@/components/PainelPrevisao';
import PainelBusca from '@/components/PainelBusca';
import PainelRegioes from '@/components/PainelRegioes';
import TrilhoLateral, { idPagina } from '@/components/TrilhoLateral';
import Icone from '@/components/Icone';
import Botao from '@/components/Botao';
import PularConteudo from '@/components/PularConteudo';
import ContextoRegiao from '@/components/ContextoRegiao';
import BoasVindas from '@/components/BoasVindas';
import { sessaoAtual, boasVindasVista } from '@/lib/sessao';
import { obterEvento, obterPrevisao, obterAlagamento } from '@/lib/nisarService';
import { REGIOES } from '@/data/regioes';

export default function PaginaPainel() {
  useTela('painel');
  return <ProtegerRota><Painel /></ProtegerRota>;
}

function Painel() {
  const palco = useRef(null);
  const topo = useRef(null);
  const [alturaTopo, setAlturaTopo] = useState(64);
  const [d, setD] = useState(null);
  const [indice, setIndice] = useState(1);
  const [tocando, setTocando] = useState(false);
  const [boasVindas, setBoasVindas] = useState(null);   // id da área cadastrada, enquanto o pop-up estiver aberto
  const [pagina, setPagina] = useState('regioes');   // regioes | previsao | busca (uma por vez)
  const [lugar, setLugar] = useState(null);
  // região do usuário em foco ao abrir. 🔌 INTEGRAÇÃO: vir do perfil/geolocalização; por ora, a primeira com cenas
  const [regiaoId, setRegiaoId] = useState(() => REGIOES.find((r) => r.status === 'disponivel')?.id ?? null);
  const [modo, setModo] = useState('globo');
  const [gaveta, setGaveta] = useState(false);       // só tem efeito no celular (gaveta inferior)

  useEffect(() => {
    if (!gaveta) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setGaveta(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [gaveta]);

  // pop-up de boas-vindas: só logo depois do login
  useEffect(() => { const s = sessaoAtual(); if (s?.boasVindas) setBoasVindas(s.areaCadastrada ?? REGIOES[0].id); }, []);

  useEffect(() => {
    Promise.all([obterEvento(), obterPrevisao(), obterAlagamento()]).then(([evento, previsao, alagamento]) => {
      setD({ evento, previsao, alagamento }); setIndice(evento.indiceAtual);
    });
  }, []);
  const irPara = useCallback((id) => { setPagina(id); setGaveta(true); }, []);
  // abrir uma região leva à previsão; voltar ao globo leva à lista
  useEffect(() => { setPagina(modo === 'regional' ? 'previsao' : 'regioes'); }, [modo === 'regional']); // eslint-disable-line react-hooks/exhaustive-deps
  const verNoMapa = useCallback((l) => { setLugar({ ...l }); setGaveta(false); }, []);

  // altura real da gaveta fechada (celular): o mapa reserva esse espaço embaixo
  useEffect(() => {
    if (!topo.current) return undefined;
    const ro = new ResizeObserver(([e]) => setAlturaTopo(Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)));
    ro.observe(topo.current);
    return () => ro.disconnect();
  }, [d, modo]);

  if (!d) return <div className="carregando"><span className="carregando__gota" />Carregando…</div>;
  const { evento, previsao, alagamento } = d;
  const naRegiao = modo === 'regional';
  const regiao = REGIOES.find((r) => r.id === regiaoId);
  const trocarRegiao = () => { setTocando(false); setGaveta(false); palco.current?.voltarAoGlobo(); };

  return (
    <div className="pagina pagina--painel">
      <PularConteudo />
      <Cabecalho atual="painel" />
      <main className={`painel painel--${naRegiao ? 'regional' : 'globo'} ${gaveta ? 'painel--gaveta' : ''}`} id="conteudo" tabIndex={-1} style={{ '--gaveta-fechada': `${alturaTopo}px` }}>
        <PalcoMapa ref={palco} regioes={REGIOES} regiaoId={regiaoId} aoSelecionarRegiao={setRegiaoId} aoMudarModo={setModo}
          evento={evento} alagamento={alagamento} indice={indice} area={previsao.areaPorCena[indice]} lugar={lugar} aoVoltar={() => trocarRegiao()}>
          <LinhaDoTempo cenas={evento.cenas} indice={indice} aoMudar={setIndice} tocando={tocando} aoAlternar={() => setTocando((t) => !t)} />
        </PalcoMapa>

        <aside className={`lateral ${gaveta ? 'lateral--aberta' : ''}`} aria-label={naRegiao ? `Painel de ${regiao?.nome}` : 'Escolha de região'}>
          <TrilhoLateral ativa={pagina} aoMudar={irPara} />
          <div className="lateral__topo" ref={topo}>
            <button type="button" className="lateral__alca" onClick={() => setGaveta((g) => !g)} aria-expanded={gaveta} aria-controls="lateral-conteudo">
              <span className="lateral__alca-traco" aria-hidden="true" />
              <span>{gaveta ? 'Recolher painel' : naRegiao ? 'Abrir painel' : 'Ver regiões'}</span>
            </button>
            {naRegiao && <ContextoRegiao regiao={regiao} cena={evento.cenas[indice]} area={previsao.areaPorCena[indice]} nivel={previsao.nivel} aoVoltar={trocarRegiao} />}
          </div>
          <div className="lateral__conteudo" id="lateral-conteudo">
            <div className="lateral__corpo" key={pagina} role="tabpanel" id={idPagina(pagina).painel} aria-labelledby={idPagina(pagina).aba} tabIndex={0}>
              {pagina === 'regioes' && (
                <PainelRegioes regioes={REGIOES} regiaoId={regiaoId} aberta={naRegiao ? regiaoId : null}
                  aoSelecionar={(id) => { if (naRegiao && id !== regiaoId) trocarRegiao(); setRegiaoId(id); }}
                  aoMergulhar={() => { setGaveta(false); palco.current?.mergulhar(); }} />
              )}
              {pagina !== 'regioes' && !naRegiao && (
                <div className="vazio-pagina">
                  <Icone nome={pagina === 'previsao' ? 'atividade' : 'busca'} tamanho={28} />
                  <h2>{pagina === 'previsao' ? 'Previsão' : 'Buscar local'}</h2>
                  <p>{pagina === 'previsao' ? 'A previsão aparece quando você abre uma região com cenas prontas.' : 'Abra uma região para buscar municípios dentro dela.'}</p>
                  <button type="button" className="link-acao" onClick={() => irPara('regioes')}>Escolher região <Icone nome="seta" tamanho={14} /></button>
                </div>
              )}
              {pagina === 'previsao' && naRegiao && <PainelPrevisao previsao={previsao} indice={indice} />}
              {pagina === 'busca' && naRegiao && <PainelBusca previsao={previsao} aoVerNoMapa={verNoMapa} />}
            </div>
            {naRegiao && (
              <div className="lateral__acao">
                <Botao href="/analise" variante="cta" bloco>Ver análise aprofundada</Botao>
              </div>
            )}
          </div>
        </aside>
      </main>
      {boasVindas && (
        <BoasVindas regiao={REGIOES.find((r) => r.id === boasVindas)}
          aoAbrir={() => { boasVindasVista(); setBoasVindas(null); setRegiaoId(boasVindas); setTimeout(() => palco.current?.mergulhar(), 60); }}
          aoOutra={() => { boasVindasVista(); setBoasVindas(null); setPagina('regioes'); setGaveta(true); setTimeout(() => document.getElementById(matchMedia('(min-width: 901px)').matches ? 'busca-regiao' : 'trilho-aba-regioes')?.focus(), 80); /* no celular, sem abrir o teclado */ }} />
      )}
    </div>
  );
}
