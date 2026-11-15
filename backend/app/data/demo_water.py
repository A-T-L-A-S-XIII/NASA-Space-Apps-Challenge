"""Níveis demo do rio por mês, usados pelo DemoProvider.

ATENÇÃO: valores ILUSTRATIVOS, não são medições. O NISAR só entrou em
operação depois de 2025, então não há imagem NISAR dos eventos de
2022–2024. Os números seguem a cronologia dos eventos conhecidos:
estiagem de 2022 até o início de 2023 e enchentes de set/2023, nov/2023
e mai/2024 (a maior).

"nível" é relativo ao normal: 1.0 = rio no tamanho de sempre, 2.0 = mancha
com o dobro da largura. Meses fora da tabela usam um ciclo sazonal suave.
"""

DEMO_NOTE = (
    "Dados ilustrativos (demo). O NISAR só entrou em operação depois de 2025, "
    "então não há imagens NISAR dos eventos de 2022 a 2024 no Vale do Taquari. "
    "Os valores seguem a cronologia dos eventos conhecidos, mas não são medições. "
    "Os meses depois de 2024 também são demo até o NISAR processado entrar na API."
)

# Meia largura da mancha com o rio no nível normal (largura total = 2x)
BASE_HALF_WIDTH_M = 150

TAQUARI_LEVELS = {
    # Estiagem de 2022 até o início de 2023
    "2022-01": 0.55, "2022-02": 0.50, "2022-03": 0.50, "2022-04": 0.60,
    "2022-05": 0.72, "2022-06": 0.85, "2022-07": 0.80, "2022-08": 0.72,
    "2022-09": 0.70, "2022-10": 0.70, "2022-11": 0.60, "2022-12": 0.50,
    "2023-01": 0.45, "2023-02": 0.50, "2023-03": 0.60, "2023-04": 0.75,
    "2023-05": 0.90, "2023-06": 1.10, "2023-07": 1.00, "2023-08": 1.15,
    # Enchentes de setembro e novembro de 2023
    "2023-09": 2.60, "2023-10": 1.50, "2023-11": 2.10, "2023-12": 1.30,
    "2024-01": 1.10, "2024-02": 1.00, "2024-03": 1.00, "2024-04": 1.30,
    # Maior enchente: maio de 2024
    "2024-05": 3.60, "2024-06": 1.70, "2024-07": 1.30, "2024-08": 1.10,
    "2024-09": 0.95, "2024-10": 1.00, "2024-11": 0.95, "2024-12": 0.90,
}

TAQUARI_EVENTS = {
    "2022-01": "Estiagem: chuva abaixo da média no RS",
    "2023-01": "Estiagem chega ao fim no início de 2023",
    "2023-09": "Enchente de setembro de 2023, após ciclone extratropical",
    "2023-11": "Nova enchente em novembro de 2023",
    "2024-05": "Maior enchente já registrada no Vale do Taquari",
}

DEMO_DATA = {
    "vale-do-taquari": {"levels": TAQUARI_LEVELS, "events": TAQUARI_EVENTS},
}
