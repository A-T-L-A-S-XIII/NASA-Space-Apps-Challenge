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
