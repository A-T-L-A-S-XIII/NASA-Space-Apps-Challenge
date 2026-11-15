"""Textos explicativos para o cidadão leigo (rota /api/explain).

Regras para quem editar:
- Português simples, frases curtas, sem jargão sem explicação.
- Não dizer que uma enchente ou seca específica foi causada pelo El Niño ou
  pela La Niña (decisão D-F do time). Falar só de tendência.
- Não usar palavras como "oficial" nem prometer previsão.
- "body" tem parágrafos separados por uma linha em branco.
"""

# Cores das camadas de radar: as mesmas de pipeline/common.py
RADAR_LEGEND = [
    {"label": "Água candidata", "color": "#2b6cb0", "pattern": "solid",
     "meaning": "O radar viu uma superfície lisa e escura, típica de água, nesta data."},
    {"label": "Água persistente", "color": "#1d3f73", "pattern": "solid",
     "meaning": "Era água na data anterior do mesmo satélite e continua sendo."},
    {"label": "Expansão candidata", "color": "#4ea3f0", "pattern": "solid",
     "meaning": "Não era água na data anterior e agora parece ser: a água avançou."},
    {"label": "Recuo candidato", "color": "#e6a03c", "pattern": "solid",
     "meaning": "Era água na data anterior e agora não parece ser: a água baixou."},
    {"label": "Sem observação válida", "color": "#8a8a8a", "pattern": "hatch",
     "meaning": "O radar não conseguiu medir este ponto nesta data. Não quer dizer que está seco."},
]

# Cores dos status da linha do tempo (seca, normal, alerta, enchente)
STATUS_LEGEND = [
    {"label": "Seca", "color": "#c27c2c", "pattern": "solid",
     "meaning": "Área de água pelo menos 25% menor que a linha de base: rio baixo, sinal de estiagem."},
    {"label": "Normal", "color": "#7fa7c9", "pattern": "solid",
     "meaning": "Área de água perto do esperado (de 25% a menos até 30% a mais que a linha de base)."},
    {"label": "Alerta", "color": "#f0b400", "pattern": "solid",
     "meaning": "Área de água de 30% a 80% maior que a linha de base: rio cheio, vale acompanhar."},
    {"label": "Enchente", "color": "#a3261b", "pattern": "solid",
     "meaning": "Área de água 80% ou mais acima da linha de base: o rio saiu do leito."},
]

TOPICS = [
    {
        "id": "sar",
        "title": "Como o radar enxerga através das nuvens",
        "summary": "O radar do satélite manda o próprio sinal e mede o eco. Por isso funciona à noite e com céu fechado.",
        "icon": "radar",
        "body": (
            "Uma câmera comum depende da luz do sol: à noite ou com nuvens, não vê o chão. "
            "O radar de abertura sintética (SAR, na sigla em inglês) funciona de outro jeito. "
            "O satélite emite ondas de rádio, as micro-ondas, e mede quanto desse sinal volta.\n\n"
            "As micro-ondas atravessam nuvens, fumaça e quase toda chuva. E como o satélite leva "
            "a própria \"lanterna\", também funciona de noite. Isso importa muito em enchentes, "
            "que costumam acontecer justamente com dias seguidos de céu fechado.\n\n"
            "\"Abertura sintética\" quer dizer que o satélite junta os ecos recebidos enquanto "
            "se move, como se tivesse uma antena com quilômetros de comprimento. É isso que "
            "permite ver detalhes de poucos metros lá do espaço."
        ),
    },
    {
        "id": "agua-no-radar",
        "title": "Por que a água aparece escura no radar",
        "summary": "Água parada é lisa como um espelho: rebate o sinal para longe e quase nada volta ao satélite.",
        "icon": "droplets",
        "body": (
            "O radar olha o chão de lado, não de cima. Quando o sinal bate numa superfície "
            "áspera, como solo, plantação, mato ou casas, ele se espalha para todos os lados e "
            "uma parte volta para o satélite. Na imagem, esses lugares ficam claros.\n\n"
            "Água parada é lisa. Ela funciona como um espelho e rebate o sinal para longe do "
            "satélite. Quase nada volta, então a água aparece escura. Esse eco que volta se "
            "chama retroespalhamento e é medido em decibéis (dB). Abaixo de certo valor, "
            "tratamos o ponto como água candidata.\n\n"
            "Há pegadinhas. Vento forte cria ondinhas e deixa a água mais clara. Asfalto liso e "
            "sombras de morros podem parecer água. Dentro da cidade, o sinal bate na água e "
            "depois na parede dos prédios e volta forte, então o radar tende a enxergar menos "
            "água do que existe nas áreas urbanas. Por isso falamos em água \"candidata\"."
        ),
    },
    {
        "id": "nisar",
        "title": "NISAR: o radar da NASA e da ISRO",
        "summary": "Satélite feito pela NASA e pela agência espacial da Índia, com dois radares: banda L e banda S.",
        "icon": "satellite",
        "body": (
            "O NISAR (NASA-ISRO Synthetic Aperture Radar) é uma missão conjunta da NASA, dos "
            "Estados Unidos, e da ISRO, a agência espacial da Índia. Foi lançado em julho de "
            "2025 e é o primeiro satélite com dois radares de frequências diferentes.\n\n"
            "A banda L, feita pela NASA, usa ondas de cerca de 24 cm. Elas atravessam a copa "
            "das árvores e ajudam a achar água escondida embaixo da vegetação. A banda S, feita "
            "pela ISRO, usa ondas de cerca de 10 cm e é mais sensível a plantações e à "
            "vegetação baixa.\n\n"
            "O NISAR passa sobre o mesmo ponto a cada 12 dias e os dados são abertos e "
            "gratuitos, distribuídos pelo ASF DAAC, da NASA. No Vale do Taquari, duas órbitas "
            "cobrem a região: uma de manhã e outra à noite. O Water Waltz usa o produto GCOV, "
            "que já vem com a imagem corrigida para o relevo e posicionada no mapa."
        ),
    },
    {
        "id": "el-nino",
        "title": "El Niño",
        "summary": "Aquecimento das águas do Oceano Pacífico que, em média, traz mais chuva ao Sul do Brasil.",
        "icon": "cloud-rain",
        "body": (
            "El Niño é quando a água do Oceano Pacífico perto da linha do Equador fica mais "
            "quente que o normal por vários meses. Os cientistas medem isso com o índice ONI, "
            "da NOAA, a agência de clima dos Estados Unidos: é a diferença de temperatura do "
            "mar em relação à média, em períodos de 3 meses. Aqui usamos a regra simples: ONI "
            "de +0,5 °C ou mais indica El Niño.\n\n"
            "Esse calor muda os ventos no alto da atmosfera. Sobre o sul da América do Sul, uma "
            "corrente de vento forte, o jato subtropical, segura as frentes frias por mais "
            "tempo em cima do Sul do Brasil e traz mais umidade da Amazônia. O resultado típico "
            "é chuva acima da média no Rio Grande do Sul, principalmente na primavera e no "
            "inverno.\n\n"
            "É uma tendência, não uma regra: há anos de El Niño sem enchente e enchentes sem El "
            "Niño. O Water Waltz mostra o El Niño e a água lado a lado, mas não diz que uma "
            "enchente específica foi causada por ele. Isso exige um estudo próprio."
        ),
    },
    {
        "id": "la-nina",
        "title": "La Niña",
        "summary": "Resfriamento das águas do Pacífico, ligado a menos chuva e a estiagens no Rio Grande do Sul.",
        "icon": "sun",
        "body": (
            "La Niña é o contrário do El Niño: a água do Pacífico perto do Equador fica mais "
            "fria que o normal. Aqui, um ONI de −0,5 °C ou menos indica La Niña.\n\n"
            "No Sul do Brasil, a La Niña costuma vir com menos chuva, principalmente na "
            "primavera e no verão. As frentes frias passam mais rápido e chove menos do que a "
            "lavoura e os rios precisam. Por isso ela é associada às estiagens no Rio Grande "
            "do Sul.\n\n"
            "Entre 2020 e o início de 2023 o Pacífico ficou em La Niña quase sem pausa, e esse "
            "período coincidiu com estiagens seguidas no estado. Como no El Niño, é uma "
            "tendência: a La Niña aumenta a chance de seca, mas não decide sozinha o que "
            "acontece em cada lugar."
        ),
    },
    {
        "id": "como-ler-o-mapa",
        "title": "Como ler o mapa",
        "summary": "O que cada cor significa, nas camadas de radar e nos status de seca e enchente.",
        "icon": "map",
        "body": (
            "As camadas de radar mostram o que o satélite viu em cada data. Azul é água "
            "candidata. A camada de mudança compara com a data anterior do mesmo satélite e da "
            "mesma órbita: azul claro é onde a água avançou e laranja é onde ela recuou. "
            "Cinza hachurado é onde o radar não conseguiu medir, e isso não quer dizer que o "
            "lugar está seco.\n\n"
            "Na linha do tempo, cada mês recebe um status comparando a área de água com a "
            "linha de base, que é o rio no tamanho normal: seca, normal, alerta ou enchente. "
            "Uma cidade aparece como atingida quando a água cobre parte importante do centro "
            "dela.\n\n"
            "Fique atento ao selo \"demo\": esses valores são ilustrativos, não medições. O "
            "mapa é um indicador de mudança de água a partir de observações de radar. Não é um "
            "mapa validado de enchente, não é previsão e não serve para decidir rota ou "
            "evacuação. Em emergência, siga a Defesa Civil."
        ),
        "legend": RADAR_LEGEND + STATUS_LEGEND,
    },
]

TOPICS_BY_ID = {topic["id"]: topic for topic in TOPICS}
