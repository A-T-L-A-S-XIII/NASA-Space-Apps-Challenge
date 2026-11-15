/* Conteúdo de demonstração do mockup. Nada aqui é dado real de NISAR. */
window.WW_CONTENT = {
  /* Localização simulada do usuário (no produto viria do navegador/perfil). */
  user: {
    name: "Saulo",
    initials: "S",
    location: {
      continent: "América do Sul",
      continentOf: "da América do Sul",
      continentKey: "SA",
      country: "BRA",
      countryName: "Brasil",
      state: "43",
      stateName: "Rio Grande do Sul",
      stateUF: "RS",
      municipality: "4311403",
      municipalityName: "Lajeado",
      region: "vale-do-taquari",
      regionName: "Vale do Taquari",
      lon: -51.961,
      lat: -29.467,
    },
  },

  /* Municípios do Vale do Taquari (IBGE, malha de data/fallback/municipios-malha.geojson), com o centro
     aproximado. Servem ao select do cadastro e para abrir o app na cidade do usuário (sem chamar a API). */
  valeMunicipios: [
    { id: "4301008", name: "Arroio do Meio", lon: -51.969, lat: -29.357 },
    { id: "4302402", name: "Bom Retiro do Sul", lon: -51.926, lat: -29.636 },
    { id: "4304614", name: "Canudos do Vale", lon: -52.235, lat: -29.324 },
    { id: "4304697", name: "Capitão", lon: -51.978, lat: -29.282 },
    { id: "4305587", name: "Colinas", lon: -51.874, lat: -29.385 },
    { id: "4305835", name: "Coqueiro Baixo", lon: -52.11, lat: -29.16 },
    { id: "4305934", name: "Coronel Pilar", lon: -51.724, lat: -29.258 },
    { id: "4306205", name: "Cruzeiro do Sul", lon: -52.042, lat: -29.551 },
    { id: "4306759", name: "Doutor Ricardo", lon: -51.973, lat: -29.087 },
    { id: "4306809", name: "Encantado", lon: -51.926, lat: -29.215 },
    { id: "4307807", name: "Estrela", lon: -51.921, lat: -29.512 },
    { id: "4308078", name: "Fazenda Vilanova", lon: -51.839, lat: -29.589 },
    { id: "4308433", name: "Forquetinha", lon: -52.119, lat: -29.379 },
    { id: "4310363", name: "Imigrante", lon: -51.781, lat: -29.342 },
    { id: "4311403", name: "Lajeado", lon: -51.961, lat: -29.467 },
    { id: "4312054", name: "Marques de Souza", lon: -52.145, lat: -29.297 },
    { id: "4312153", name: "Mato Leitão", lon: -52.136, lat: -29.521 },
    { id: "4312609", name: "Muçum", lon: -51.823, lat: -29.14 },
    { id: "4313003", name: "Nova Bréscia", lon: -52.036, lat: -29.217 },
    { id: "4314159", name: "Paverama", lon: -51.727, lat: -29.575 },
    { id: "4315131", name: "Pouso Novo", lon: -52.225, lat: -29.161 },
    { id: "4315156", name: "Progresso", lon: -52.312, lat: -29.227 },
    { id: "4315206", name: "Putinga", lon: -52.138, lat: -29.033 },
    { id: "4315453", name: "Relvado", lon: -52.068, lat: -29.114 },
    { id: "4315800", name: "Roca Sales", lon: -51.832, lat: -29.243 },
    { id: "4316758", name: "Santa Clara do Sul", lon: -52.134, lat: -29.453 },
    { id: "4317251", name: "Santa Tereza", lon: -51.706, lat: -29.145 },
    { id: "4319711", name: "São Valentim do Sul", lon: -51.762, lat: -29.066 },
    { id: "4320453", name: "Sério", lon: -52.238, lat: -29.405 },
    { id: "4321451", name: "Teutônia", lon: -51.77, lat: -29.466 },
    { id: "4321626", name: "Travesseiro", lon: -52.101, lat: -29.284 },
    { id: "4322608", name: "Venâncio Aires", lon: -52.203, lat: -29.554 },
    { id: "4322855", name: "Vespasiano Corrêa", lon: -51.854, lat: -29.065 },
    { id: "4323770", name: "Westfália", lon: -51.736, lat: -29.413 },
  ],

  /* Feed com notícias de várias regiões; a subaba filtra pela região do usuário
     (NewsRail usa `region` === user.location.region). */
  news: [
    { id: 1, region: "vale-do-taquari", tag: "Rio Taquari", source: "Defesa Civil RS", time: "há 2 h", img: "assets/img/news-river.webp",
      title: "Régua de Lajeado marca 13,2 m e segue estável após chuva da madrugada" },
    { id: 2, region: "vale-do-taquari", tag: "Radar", source: "Water Waltz", time: "há 5 h", img: "assets/img/news-satellite.webp",
      title: "Nova passagem NISAR sobre o Vale do Taquari prevista para 19/11" },
    { id: 3, region: "vale-do-taquari", tag: "Acessos", source: "Prefeitura de Estrela", time: "ontem",
      title: "Ponte entre Estrela e Lajeado tem tráfego liberado em meia pista" },
    { id: 4, region: "vale-do-taquari", tag: "Previsão", source: "MetSul", time: "ontem",
      title: "Frente fria deve trazer 40–60 mm à Serra e ao Vale no fim de semana" },
    { id: 5, region: "vale-do-taquari", tag: "Comunidade", source: "Rádio Independente", time: "há 2 dias",
      title: "Moradores de Muçum mapeiam rotas alternativas em oficina com a UNIVATES" },
    { id: 6, region: "vale-do-taquari", tag: "Solo", source: "Emater/RS", time: "há 3 dias",
      title: "Umidade do solo acima da média em Roca Sales e Arroio do Meio" },
    /* Outras regiões — NÃO devem aparecer para este usuário */
    { id: 90, region: "grande-goiania", tag: "Chuva", source: "Exemplo", time: "há 1 h", title: "Notícia de outra região (Goiânia)" },
    { id: 91, region: "lisboa", tag: "Costa", source: "Exemplo", time: "há 3 h", title: "Notícia de outra região (Lisboa)" },
    { id: 92, region: "new-york", tag: "Coast", source: "Example", time: "há 4 h", title: "Notícia de outra região (Nova York)" },
  ],

  /* Conteúdo editorial por nível de profundidade (Aba 2) */
  levels: [
    { key: "planet", label: "Planeta", depth: "0 km", img: "assets/img/news-satellite.webp" },
    { key: "continent", label: "Continente", depth: "≈ 4.000 km", img: "assets/img/level-continent.webp",
      kicker: "Região", cardTitle: "A água desenha o continente." },
    { key: "country", label: "País", depth: "≈ 1.500 km", img: "assets/img/level-country.webp",
      kicker: "País", cardTitle: "Rios que cruzam fronteiras." },
    { key: "state", label: "Estado", depth: "≈ 400 km", img: "assets/img/level-state.webp",
      kicker: "Estado", cardTitle: "Serra, vale e várzea." },
    { key: "municipality", label: "Município", depth: "≈ 20 km", img: "assets/img/level-municipality.webp",
      kicker: "Município", cardTitle: "Onde você mora." },
  ],

  /* Municípios do Vale do Taquari (realce no mapa estadual) */
  valeDoTaquari: ["4311403", "4307807", "4312609", "4315800", "4301008", "4306809", "4302402", "4321303", "4306205", "4305587"],
};
