"""Passagens NISAR já processadas fora da API (Fotos/nisar_taquari_50).

A API só lê os arquivos prontos: catalogo.json, e para cada data
dados.json, area_cheia_seca.geojson, miniatura.png (radar) e slide.png.

Cuidados que valem para tudo aqui (ver backend/PENDENCIAS.md):
- a área de água depende da trilha (órbita); só compare datas da mesma trilha;
- a área processada vai de Muçum a Lajeado (-29,15 a -29,55 de latitude);
  a parte sul do vale (Bom Retiro do Sul e Taquari) fica de fora.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.config import settings

REPO = Path(__file__).resolve().parents[3]
DATA = Path(__file__).resolve().parents[1] / "data"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
KM_POR_GRAU = 111.32
VEGETACAO_ALAGADA = {
    "disponivel": False,
    "motivo": "As cenas processadas têm só a polarização HH. Para separar vegetação alagada "
              "é preciso a polarização HV (ou a razão HH/HV) e um novo processamento.",
    "requer": "Reprocessar as cenas GCOV com HH+HV e criar a rota /api/nisar/vegetacao-alagada.",
}


class NisarMissing(RuntimeError):
    pass


def nisar_dir() -> Path:
    p = Path(settings.nisar_dir) if settings.nisar_dir else REPO / "Fotos" / "nisar_taquari_50"
    return p if p.is_absolute() else REPO / p


def nome_mes(ym: str) -> str:
    ano, mes = ym.split("-")
    return f"{MESES[int(mes) - 1]} de {ano}"


def data_br(iso: str) -> str:
    a, m, d = iso.split("-")
    return f"{d}/{m}"


def fmt_km2(v: float) -> str:
    return f"{v:.1f}".replace(".", ",") + " km²"


# ------------------------------------------------------------------ geometria
def _rings(geom: dict):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        yield from geom["coordinates"]


def _ring_area_deg2(ring) -> float:
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def area_km2(geom: dict) -> float:
    """Área aproximada (plano local com correção de latitude); boa para polígonos pequenos."""
    total = 0.0
    for poly in _rings(geom):
        lat = sum(p[1] for p in poly[0]) / len(poly[0])
        k = KM_POR_GRAU * KM_POR_GRAU * math.cos(math.radians(lat))
        total += (_ring_area_deg2(poly[0]) - sum(_ring_area_deg2(h) for h in poly[1:])) * k
    return total


def centroid(geom: dict) -> tuple[float, float]:
    pts = [p for poly in _rings(geom) for p in poly[0][:-1]]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def _in_ring(x: float, y: float, ring) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def contains(geom: dict, x: float, y: float) -> bool:
    for poly in _rings(geom):
        if _in_ring(x, y, poly[0]) and not any(_in_ring(x, y, h) for h in poly[1:]):
            return True
    return False


# ------------------------------------------------------------------- dados
class Nisar:
    def __init__(self, root: Path):
        if not (root / "catalogo.json").is_file():
            raise NisarMissing(f"Sem catalogo.json em {root}. Traga a pasta Fotos/nisar_taquari_50 "
                               "(branch Fotos) ou defina NISAR_DIR.")
        self.root = root
        self.catalog: list[dict] = json.loads((root / "catalogo.json").read_text(encoding="utf-8"))
        self.by_n = {p["n"]: p for p in self.catalog}
        b = self.catalog[0]["limites_leaflet"]  # [[sul, oeste], [norte, leste]]
        self.cover = {"oeste": b[0][1], "sul": b[0][0], "leste": b[1][1], "norte": b[1][0]}
        self.municipios = json.loads((DATA / "vale_municipios.geojson").read_text(encoding="utf-8"))

    def folder(self, n: int) -> Path | None:
        p = self.by_n.get(n)
        if p is None:
            return None
        f = self.root / f"img_{n:02d}_{p['data']}"
        return f if f.is_dir() else None

    def passagem(self, n: int) -> dict | None:
        p = self.by_n.get(n)
        if p is None:
            return None
        return {**p, "imagens": {"radar": f"/api/nisar/passagens/{n}/imagem/radar",
                                 "slide": f"/api/nisar/passagens/{n}/imagem/slide"},
                "geojson": f"/api/nisar/passagens/{n}/geojson"}

    def geojson(self, n: int) -> dict | None:
        f = self.folder(n)
        if f is None or not (f / "area_cheia_seca.geojson").is_file():
            return None
        fc = json.loads((f / "area_cheia_seca.geojson").read_text(encoding="utf-8"))
        p = self.by_n[n]
        for feat in fc["features"]:
            feat["properties"] = {**feat.get("properties", {}), "data": p["data"], "trilha": p["trilha"],
                                  "area_km2": round(area_km2(feat["geometry"]), 4)}
        return fc

    def imagem(self, n: int, tipo: str) -> Path | None:
        f = self.folder(n)
        nome = {"radar": "miniatura.png", "slide": "slide.png"}.get(tipo)
        if f is None or nome is None or not (f / nome).is_file():
            return None
        return f / nome

    def do_mes(self, ym: str) -> list[dict]:
        return [p for p in self.catalog if p["data"].startswith(ym)]

    def meses(self) -> list[str]:
        return sorted({p["data"][:7] for p in self.catalog})

    # -------------------------------------------------------------- resumo
    def resumo(self, ym: str) -> dict:
        ps = self.do_mes(ym)
        mes = nome_mes(ym)
        trecho = "no trecho do rio Taquari entre Muçum e Lajeado"
        if not ps:
            return {"mes": ym, "mes_nome": mes, "passagens": 0, "nivel": "sem_dados",
                    "frase": f"O radar não passou {trecho} em {mes}, então não há como dizer se alagou.",
                    "cheia_km2": None, "seca_km2": None, "por_trilha": [], "datas": []}
        cheia = round(sum(p["cheia_km2"] for p in ps), 1)
        seca = round(sum(p["seca_km2"] for p in ps), 1)
        pico = max(ps, key=lambda p: p["cheia_km2"])
        if cheia == 0:
            nivel, frase = "normal", (f"Em {mes}, o radar passou {len(ps)} vezes {trecho} "
                                      "e não viu água fora do normal. O rio ficou no leito de sempre.")
        elif cheia < 1:
            nivel, frase = "normal", (f"Em {mes}, o radar passou {len(ps)} vezes {trecho} e quase não viu "
                                      f"água fora do normal: {fmt_km2(cheia)} no mês, a maior parte em "
                                      f"{data_br(pico['data'])}. Nada parecido com uma enchente.")
        elif cheia < 5:
            nivel, frase = "atencao", (f"Em {mes}, o radar viu {fmt_km2(cheia)} de água fora do normal {trecho}, "
                                       f"mais em {data_br(pico['data'])}. É pouco, mas vale acompanhar.")
        else:
            nivel, frase = "alagamento", (f"Em {mes}, o radar viu {fmt_km2(cheia)} de água fora do normal {trecho}. "
                                          f"O pior momento foi em {data_br(pico['data'])}.")
        trilhas = []
        for t in sorted({p["trilha"] for p in ps}):
            v = [p["agua_km2"] for p in ps if p["trilha"] == t]
            trilhas.append({"trilha": t, "passagens": len(v), "agua_min_km2": min(v), "agua_max_km2": max(v)})
        return {
            "mes": ym, "mes_nome": mes, "passagens": len(ps), "nivel": nivel, "frase": frase,
            "cheia_km2": cheia, "seca_km2": seca,
            "pico": {"data": pico["data"], "cheia_km2": pico["cheia_km2"]} if cheia else None,
            "na_janela_da_enchente": any(p["na_janela_da_enchente"] for p in ps),
            "por_trilha": trilhas,
            "datas": [p["data"] for p in ps],
            "area_coberta": self.cover,
            "aviso": "A área de água muda com a trilha do satélite: compare só datas da mesma trilha.",
        }

    # ------------------------------------------------------ por município
    def por_municipio(self, ym: str) -> dict:
        ps = self.do_mes(ym)
        c = self.cover
        linhas = {}
        for m in self.municipios["features"]:
            xs = [p[0] for poly in _rings(m["geometry"]) for p in poly[0]]
            ys = [p[1] for poly in _rings(m["geometry"]) for p in poly[0]]
            toca = not (max(xs) < c["oeste"] or min(xs) > c["leste"] or max(ys) < c["sul"] or min(ys) > c["norte"])
            linhas[m["properties"]["id"]] = {"id": m["properties"]["id"], "nome": m["properties"]["name"],
                                             "toca_area_coberta": toca, "cheia_km2": 0.0, "seca_km2": 0.0,
                                             "por_data": {p["data"]: {"cheia_km2": 0.0, "seca_km2": 0.0} for p in ps}}
        fora = {"cheia_km2": 0.0, "seca_km2": 0.0}
        for p in ps:
            fc = self.geojson(p["n"]) or {"features": []}
            for f in fc["features"]:
                classe = f["properties"].get("classe")
                if classe not in ("cheia", "seca"):
                    continue
                a = f["properties"]["area_km2"]
                x, y = centroid(f["geometry"])
                alvo = next((m for m in self.municipios["features"] if contains(m["geometry"], x, y)), None)
                if alvo is None:
                    fora[f"{classe}_km2"] += a
                    continue
                ln = linhas[alvo["properties"]["id"]]
                ln[f"{classe}_km2"] += a
                ln["por_data"][p["data"]][f"{classe}_km2"] += a
        def arred(d):
            return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}
        itens = []
        for ln in linhas.values():
            ln["por_data"] = [{"data": d, **arred(v)} for d, v in ln["por_data"].items()]
            itens.append(arred(ln))
        itens.sort(key=lambda i: (-i["cheia_km2"], not i["toca_area_coberta"], i["nome"]))
        return {
            "mes": ym, "mes_nome": nome_mes(ym), "datas": [p["data"] for p in ps],
            "metodo": "Cada polígono de cheia ou seca é somado ao município que contém o seu centro "
                      "(malha municipal do IBGE). A área processada cobre só parte de cada município.",
            "fora_dos_municipios": arred(fora),
            "municipios": itens,
        }

    # ---------------------------------------------------------- metadados
    def metadados(self) -> dict:
        trilhas = {}
        for p in self.catalog:
            t = trilhas.setdefault(p["trilha"], {"trilha": p["trilha"], "passagens": 0, "datas": []})
            t["passagens"] += 1
            t["datas"].append(p["data"])
        janela = [p["data"] for p in self.catalog if p["na_janela_da_enchente"]]
        return {
            "satelite": "NISAR (NASA/ISRO)",
            "produto": "L2 GCOV (retroespalhamento geocodificado)",
            "banda": "L",
            "polarizacao": sorted({p["pol"] for p in self.catalog}),
            "fonte": self.catalog[0]["fonte"],
            "local": "Vale do Taquari (RS) · trecho entre Muçum e Lajeado",
            "area_coberta": self.cover,
            "periodo": {"inicio": self.catalog[0]["data"], "fim": self.catalog[-1]["data"],
                        "passagens": len(self.catalog)},
            "janela_da_enchente": {"inicio": janela[0], "fim": janela[-1],
                                   "origem": "catálogo do processamento (fonte da janela ainda em aberto)"} if janela else None,
            "trilhas": list(trilhas.values()),
            "classes": {"cheia": "água fora do normal", "seca": "falta de água em relação ao normal"},
            "cuidados": [
                "A área de água depende da trilha (órbita): só compare datas da mesma trilha.",
                "A área processada vai de Muçum a Lajeado e pega parte de Estrela; Bom Retiro do Sul e Taquari ficam de fora.",
                "Indicador de mudança de água pelo radar; não é um mapa de inundação validado.",
            ],
            "vegetacao_alagada": VEGETACAO_ALAGADA,
            "granulos": [{"n": p["n"], "data": p["data"], "trilha": p["trilha"], "granulo": p["granulo"]}
                         for p in self.catalog],
            "municipios_fonte": self.municipios.get("source"),
        }


@lru_cache(maxsize=2)
def _load(root: str) -> Nisar:
    return Nisar(Path(root))


def get_nisar() -> Nisar:
    return _load(str(nisar_dir()))
