/**
 * Mapa regional (Leaflet) do Vale do Taquari.
 *  - camada "ilustrado": mapa interpretado a partir do radar NISAR (scripts/interpretar_radar.py)
 *  - camada "mapa": tiles gratuitos (OpenStreetMap / CARTO) — precisa de internet
 *  - camada "radar": imagem de radar original (banda L, HH)
 *  + polígonos reais da água nova e halo da expansão prevista.
 *
 * 🔌 INTEGRAÇÃO NISAR: para novas passagens, trocar as imagens/GeoJSON pelos arquivos do pipeline.
 */
export async function criarMapaRegional(el, { limites, alagamento, cenas, imagens, aoTilesIndisponiveis }) {
  const L = (await import('leaflet')).default;
  const bounds = L.latLngBounds([limites.sul, limites.oeste], [limites.norte, limites.leste]);
  const latC = (limites.sul + limites.norte) / 2;
  const mapa = L.map(el, { zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 16, zoomSnap: 0.25, zoomDelta: 0.5, maxBounds: bounds.pad(2) });
  mapa.attributionControl.setPrefix(false);

  // tiles gratuitos (OpenStreetMap via CARTO). Se não carregarem (offline), o mapa ilustrado assume.
  const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap · © CARTO',
  }).addTo(mapa);
  let erros = 0, carregou = false, semTiles = false;
  tiles.on('tileload', () => { carregou = true; });
  tiles.on('tileerror', () => {
    if (++erros > 3 && !carregou && !semTiles) { semTiles = true; el.classList.add('mapa-regional--sem-tiles'); aoTilesIndisponiveis?.(); }
  });

  const img = {
    ilustrado: L.imageOverlay(imagens.ilustrado, bounds, { className: 'camada-ilustrada' }),
    radarAntes: L.imageOverlay(imagens.radarAntes, bounds, { className: 'camada-radar' }),
    radarDepois: L.imageOverlay(imagens.radarDepois, bounds, { className: 'camada-radar' }),
  };
  const halo = L.geoJSON(alagamento, { interactive: false, style: { color: '#88CE71', opacity: 0.7, weight: 0, fillColor: '#88CE71', fillOpacity: 0.5, lineJoin: 'round', lineCap: 'round' } });
  const agua = L.geoJSON(alagamento, { interactive: false, style: { color: '#F5FAFF', weight: 1.2, fillColor: '#2AA3B8', fillOpacity: 1 } });
  const moldura = L.rectangle(bounds, { color: '#88CE71', weight: 1, dashArray: '4 6', fill: false, interactive: false }).addTo(mapa);
  let marcador = null, camada = 'ilustrado', indice = 0;

  const mPorPx = () => (40075016.686 * Math.cos((latC * Math.PI) / 180)) / 2 ** (mapa.getZoom() + 8);
  function atualizarHalo() {
    const exp = cenas[indice].expansaoKm;
    halo.setStyle({ weight: exp ? (2 * exp * 1000) / mPorPx() : 0 });
  }
  function aplicar() {
    const c = cenas[indice];
    Object.values(img).forEach((o) => mapa.removeLayer(o));
    if (camada === 'ilustrado') img.ilustrado.addTo(mapa);
    if (camada === 'radar') (c.radar === 'antes' ? img.radarAntes : img.radarDepois).addTo(mapa);
    const comAgua = c.expansaoKm !== null;
    if (c.expansaoKm) halo.addTo(mapa); else mapa.removeLayer(halo);
    if (comAgua) agua.addTo(mapa); else mapa.removeLayer(agua);
    atualizarHalo();
  }
  mapa.on('zoomend', atualizarHalo);
  mapa.fitBounds(bounds, { padding: [20, 20] });
  aplicar();

  return {
    setCena(i) { indice = i; aplicar(); },
    setCamada(c) { camada = c; aplicar(); },
    focar(animar = true) { mapa.invalidateSize(); mapa.flyToBounds(bounds, { padding: [24, 24], duration: animar ? 1.2 : 0 }); },
    voarPara(lon, lat, zoom = 13) { mapa.flyTo([lat, lon], zoom, { duration: 1.2 }); },
    marcar(l) {
      if (marcador) mapa.removeLayer(marcador);
      if (!l) return;
      marcador = L.marker([l.lat, l.lon], { icon: L.divIcon({ className: 'pino-mapa', html: `<span class="pino-mapa__gota"></span><span class="pino-mapa__nome">${l.nome}</span>`, iconSize: [0, 0] }) }).addTo(mapa);
    },
    zoomMais() { mapa.zoomIn(); },
    zoomMenos() { mapa.zoomOut(); },
    invalidar() { mapa.invalidateSize(); },
    get semTiles() { return semTiles; },
    destruir() { mapa.remove(); },
  };
}
