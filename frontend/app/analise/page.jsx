'use client';
import { useTela } from '@/lib/tema';
import { useEffect, useState } from 'react';
import ProtegerRota from '@/components/ProtegerRota';
import Cabecalho from '@/components/Cabecalho';
import MapaMudanca from '@/components/MapaMudanca';
import AreaPorMunicipio from '@/components/AreaPorMunicipio';
import Metadados from '@/components/Metadados';
import Botao from '@/components/Botao';
import Numero from '@/components/Numero';
import PularConteudo from '@/components/PularConteudo';
import TituloRevelado from '@/components/TituloRevelado';
import PassagensNisar from '@/components/PassagensNisar';
import { obterEvento, obterAlagamento, obterAreaPorMunicipio, obterPassagens, URL_GEOJSON } from '@/lib/nisarService';
import { dataCurta } from '@/lib/formatar';

const regiao = 'Vale do Taquari';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "11 a 23 de julho de 2026" (ou "28 de julho a 4 de agosto de 2026" quando muda o mês) */
function periodo(a, b) {
  const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number);
  if (ya === yb && ma === mb) return `${da} a ${db} de ${MESES[mb - 1]} de ${yb}`;
  return `${da} de ${MESES[ma - 1]} a ${db} de ${MESES[mb - 1]} de ${yb}`;
}
const fmt1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function PaginaAnalise() {
  useTela('analise');
  return <ProtegerRota><Analise /></ProtegerRota>;
}

function Analise() {
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([obterEvento(), obterAlagamento(), obterAreaPorMunicipio(), obterPassagens()]).then(([evento, geo, municipios, passagens]) => setD({ evento, geo, municipios, passagens }));
  }, []);
  if (!d) return <div className="carregando"><span className="carregando__gota" />Processando análise…</div>;

  const { nisar, arquivos, limitacoes } = d.evento;
  const temVegetacao = d.geo.classes.includes('vegetacao_alagada');
  const aumento = ((nisar.agua_depois_km2 - nisar.agua_antes_km2) / nisar.agua_antes_km2) * 100;

  return (
    <div className="pagina">
      <PularConteudo />
      <Cabecalho atual="analise" voltar="/painel" />
      <main className="analise" id="conteudo" tabIndex={-1}>
        <header className="analise__topo analise__topo--simples">
          <TituloRevelado>{regiao}</TituloRevelado>
          <p className="analise__data revelar" style={{ '--i': 2 }}>{periodo(nisar.data_antes, nisar.data_depois)}</p>
        </header>

        <figure className="radar-destaque revelar" style={{ '--i': 3 }}>
          <img src={arquivos.radarDepois} width={1880} height={2130} alt={`Imagem de radar NISAR de ${dataCurta(nisar.data_depois)} sobre o Vale do Taquari. Água aparece escura; cidades, claras.`} />
          <figcaption>Radar NISAR · {dataCurta(nisar.data_depois)} · {nisar.produto}</figcaption>
        </figure>

        <section className="numeros">
          <div className="numeros__item numeros__item--destaque revelar" style={{ '--i': 1 }}>
            <span>Área alagada total</span><Numero valor={nisar.area_alagada_km2} sufixo=" km²" className="numeros__valor" /><small>água nova entre as duas cenas</small>
          </div>
          <div className="numeros__item revelar" style={{ '--i': 2 }}><span>Água antes</span><Numero valor={nisar.agua_antes_km2} sufixo=" km²" className="numeros__valor" /><small>{dataCurta(nisar.data_antes)}</small></div>
          <div className="numeros__item revelar" style={{ '--i': 3 }}><span>Água depois</span><Numero valor={nisar.agua_depois_km2} sufixo=" km²" className="numeros__valor" /><small>+{Math.round(aumento)}% em 12 dias</small></div>
          <div className="numeros__item revelar" style={{ '--i': 4 }}><span>Municípios</span><Numero valor={d.municipios.length} casas={0} className="numeros__valor" /><small>{d.geo.features.length} polígonos de água nova</small></div>
        </section>

        <div className="analise__grade">
          <section className="secao revelar" style={{ '--i': 2 }}>
            <header className="secao__cab"><span className="bloco__num">01</span><h2>Mapa de mudança</h2></header>
            <MapaMudanca arquivos={arquivos} dataAntes={nisar.data_antes} dataDepois={nisar.data_depois} />
          </section>

          <div className="analise__coluna">
            <section className="secao revelar" style={{ '--i': 3 }}>
              <header className="secao__cab"><span className="bloco__num">02</span><h2>Download GeoJSON</h2></header>
              <p>Os {d.geo.features.length} polígonos de água nova, em WGS 84, prontos para SIG.</p>
              <Botao href={URL_GEOJSON} download="area_alagada_taquari.geojson" variante="primario" icone="baixar" bloco>Baixar GeoJSON</Botao>
              <p className="nota">Abre direto no <strong>QGIS</strong> ou no <strong>ArcGIS</strong>: é só arrastar o arquivo para o projeto.</p>
            </section>

            {/* Seção exibida SOMENTE se a classe existir nos dados (no Taquari ela não existe) */}
            {temVegetacao && <section className="secao"><h2>Vegetação alagada</h2></section>}

            <section className="secao revelar" style={{ '--i': 4 }}>
              <header className="secao__cab"><span className="bloco__num">03</span><h2>Como o mapa foi feito</h2></header>
              <ol className="fluxo">
                <li><b>Radar</b><span>Cenas GCOV banda L (HH) de 11/07 e 23/07</span></li>
                <li><b>Mudança</b><span>Pixels que escureceram entre as cenas viram “água nova”</span></li>
                <li><b>Interpretação</b><span>O radar vira um mapa legível: rio, cidade, mata e lavoura</span></li>
              </ol>
              <p className="nota">Fonte: {nisar.fonte}</p>
            </section>
          </div>
        </div>

        <section className="secao revelar" aria-labelledby="titulo-passagens">
          <header className="secao__cab"><span className="bloco__num">04</span><h2 id="titulo-passagens">{d.passagens.passagens.length} passagens do NISAR</h2></header>
          <p className="secao__intro">De junho a outubro o satélite passou {d.passagens.passagens.length} vezes com o vale inteiro na cena. Dê play, arraste a régua ou escolha um quadro: azul é água, verde é água <em>acima do normal</em> para aquela época.</p>
          <PassagensNisar dados={d.passagens} />
          <aside className="aviso-metodo">
            <b>Dois jeitos de medir, dois números.</b>
            <span>Os {String(nisar.area_alagada_km2).replace('.', ',')} km² do topo comparam duas cenas da mesma órbita (11/07 → 23/07) e contam tudo que virou água. A série acima mede cada cena sozinha contra o normal da época, e por isso marca só {fmt1(d.passagens.passagens.find((q) => q.data === '2026-07-23').cheia_km2)} km² “acima do normal” no dia 23/07. Os dois estão certos; respondem perguntas diferentes.</span>
          </aside>
        </section>

        <section className="secao revelar">
          <header className="secao__cab"><span className="bloco__num">05</span><h2>Área por município</h2></header>
          <blockquote className="citacao">
            <p>{d.municipios[0].municipio} concentra <em>{Math.round((d.municipios[0].areaKm2 / d.geo.totalKm2) * 100)}%</em> de toda a água nova detectada.</p>
          </blockquote>
          <AreaPorMunicipio linhas={d.municipios} total={d.geo.totalKm2} />
        </section>
        <section className="secao revelar">
          <header className="secao__cab"><span className="bloco__num">06</span><h2>Metadados</h2></header>
          <Metadados nisar={nisar} classes={d.geo.classes} limitacoes={limitacoes} passagens={d.passagens} />
        </section>
      </main>
    </div>
  );
}
