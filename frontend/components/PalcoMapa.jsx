'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { criarGlobo } from '@/lib/globo';
import { criarMapaRegional } from '@/lib/mapaRegional';
import { dataCurta } from '@/lib/formatar';
import Abas from './Abas';
import Botao from './Botao';
import Icone from './Icone';
import Numero from './Numero';
import TituloRevelado from './TituloRevelado';

/**
 * Palco do mapa: começa no globo com as regiões marcadas. O usuário escolhe uma região
 * (no globo ou na lista lateral); se ela tiver cenas processadas, "mergulha" até o mapa regional.
 */
const PalcoMapa = forwardRef(function PalcoMapa({ regioes, regiaoId, aoSelecionarRegiao, aoMudarModo, evento, alagamento, indice, area, lugar, aoVoltar, children }, ref) {
  const canvasRef = useRef(null);
  const mapaRef = useRef(null);
  const globo = useRef(null);
  const regional = useRef(null);
  const cbSel = useRef(aoSelecionarRegiao); cbSel.current = aoSelecionarRegiao;
  const [modo, setModo] = useState('globo');           // globo | mergulhando | regional
  const [camada, setCamada] = useState('ilustrado');
  const [semTiles, setSemTiles] = useState(false);
  const regiao = regioes.find((r) => r.id === regiaoId);

  useEffect(() => { aoMudarModo?.(modo); }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    globo.current = criarGlobo(canvasRef.current, {
      alvos: regioes.map((r) => ({ id: r.id, lon: r.lon, lat: r.lat, rotulo: r.nome, ativo: r.status === 'disponivel' })),
      aoClicarAlvo: (id) => cbSel.current?.(id),
      inicial: regiaoId,
    });
    let vivo = true;
    criarMapaRegional(mapaRef.current, {
      limites: evento.limites, alagamento, cenas: evento.cenas, imagens: evento.arquivos,
      aoTilesIndisponiveis: () => setSemTiles(true),
    }).then((m) => { if (vivo) { regional.current = m; m.setCena(indice); } else m.destruir(); });
    return () => { vivo = false; globo.current?.destruir(); regional.current?.destruir(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // selecionar uma região gira o globo até ela
  useEffect(() => { if (regiaoId && modo === 'globo') globo.current?.selecionar(regiaoId); }, [regiaoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { regional.current?.setCena(indice); }, [indice]);
  useEffect(() => { regional.current?.setCamada(camada); }, [camada]);
  useEffect(() => { regional.current?.marcar(lugar); if (lugar) regional.current?.voarPara(lugar.lon, lugar.lat, 13); }, [lugar]);
  useEffect(() => { if (semTiles && camada === 'mapa') setCamada('ilustrado'); }, [semTiles, camada]);

  async function mergulhar() {
    if (modo !== 'globo' || regiao?.status !== 'disponivel') return;
    setModo('mergulhando');
    await globo.current.mergulhar(regiao.id);
    setModo('regional');
    requestAnimationFrame(() => regional.current?.focar(false));
  }
  function voltarAoGlobo() { globo.current.voltar(); setModo('globo'); }
  useImperativeHandle(ref, () => ({ mergulhar, voltarAoGlobo, modo }));

  const cena = evento.cenas[indice];
  const camadas = [
    { id: 'ilustrado', rotulo: 'Ilustrado' },
    ...(semTiles ? [] : [{ id: 'mapa', rotulo: 'Mapa' }]),
    { id: 'radar', rotulo: 'Radar' },
  ];
  const noGlobo = modo !== 'regional';

  return (
    <div className={`palco palco--${modo}`}>
      <div ref={mapaRef} className="palco__regional mapa-regional" />
      <canvas ref={canvasRef} className="palco__globo" aria-label="Globo terrestre focado na região escolhida. Clique num ponto azul para trocar de região." />

      <p className="sr-only" role="status" aria-atomic="true">
        {noGlobo
          ? (regiao ? `${regiao.nome} selecionado. ${regiao.status === 'disponivel' ? 'Cenas NISAR disponíveis.' : 'Ainda sem cena processada.'}` : '')
          : `${dataCurta(cena.data)}: ${cena.tipo === 'previsto' ? 'previsão' : 'cena observada'}, ${area.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} quilômetros quadrados de água nova.`}
      </p>

      <div className="palco__titulo">
        {noGlobo ? (
          <>
            <TituloRevelado key="t-globo" atraso={0.2}>Monitoramento de <em>enchentes</em> – NISAR</TituloRevelado>
            <p className="palco__kpi">Pontos azuis cheios têm cenas de radar processadas. Toque num ponto do globo ou use a lista.</p>
          </>
        ) : (
          <>
            <button type="button" className="palco__voltar" onClick={() => (aoVoltar ? aoVoltar() : voltarAoGlobo())}>
              <Icone nome="voltar" tamanho={16} /><span>Voltar ao mapa-múndi</span>
            </button>
            <span className="sobretitulo">{evento.nisar.produto} · NISAR</span>
            <TituloRevelado key="t-regiao" atraso={0.1}>{regiao?.nome}, <em>julho</em></TituloRevelado>
            <p className="palco__kpi"><Numero valor={area} casas={1} sufixo=" km²" className="palco__kpi-valor" /> de água nova detectada</p>
          </>
        )}
      </div>

      {noGlobo && regiao && (
        <section className={`foco ${regiao.status === 'disponivel' ? 'foco--pronta' : 'foco--sem'}`} key={regiao.id} aria-labelledby="foco-nome">
          <span className="sobretitulo">Região em foco</span>
          <h2 id="foco-nome" className="foco__nome">{regiao.nome}</h2>
          <p className="foco__local">{regiao.local}</p>
          {regiao.status === 'disponivel' ? (
            <>
              <dl className="foco__dados">
                <div><dt>Água nova</dt><dd>{evento.nisar.area_alagada_km2.toLocaleString('pt-BR')} km²</dd></div>
                <div><dt>Passagens</dt><dd>19</dd></div>
                <div><dt>Período</dt><dd>jun–out 26</dd></div>
              </dl>
              <Botao onClick={mergulhar} variante="cta" icone="seta" disabled={modo !== 'globo'}>Ver enchente no mapa</Botao>
            </>
          ) : (
            <>
              <p className="foco__aviso">Ainda sem cena NISAR processada. Ela entra assim que o pipeline receber uma passagem sobre a região.</p>
              <Botao onClick={() => aoSelecionarRegiao?.(regioes.find((r) => r.status === 'disponivel')?.id)} variante="primario" icone="seta">Ver o Vale do Taquari</Botao>
            </>
          )}
        </section>
      )}

      {modo === 'regional' && (
        <>
          <div className="palco__camadas">
            <Abas variante="seletor" itens={camadas} ativa={camada} aoMudar={setCamada} rotulo="Camada do mapa" />
          </div>
          <div className="palco__ferramentas" role="group" aria-label="Controles do mapa">
            <button type="button" className="botao-icone" onClick={() => regional.current?.zoomMais()} aria-label="Aproximar" title="Aproximar"><Icone nome="mais" /></button>
            <button type="button" className="botao-icone" onClick={() => regional.current?.zoomMenos()} aria-label="Afastar" title="Afastar"><Icone nome="menos" /></button>
            <button type="button" className="ferramenta-rotulada" onClick={() => regional.current?.focar()}><Icone nome="mira" tamanho={16} /><span>Enquadrar</span></button>
          </div>
          <div className="palco__rodape">
            <ul className="legenda">
              {camada === 'ilustrado' && <><li><i className="cor cor--rio" />Rio</li><li><i className="cor cor--urbano" />Cidade</li><li><i className="cor cor--mata" />Mata</li></>}
              <li><i className="cor cor--agua" />Água nova (NISAR)</li>
              <li><i className="cor cor--previsto" />Expansão prevista</li>
              {camada === 'mapa' && <li className="legenda__fonte">Base: OpenStreetMap / CARTO</li>}
            </ul>
            {children}
          </div>
        </>
      )}
    </div>
  );
});
export default PalcoMapa;
