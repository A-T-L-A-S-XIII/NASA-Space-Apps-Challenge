"""Gera backend/app/data/vale_municipios.geojson a partir da malha do IBGE.

Roda uma vez, fora da API (precisa de internet):
    python pipeline/build_vale_municipios.py

Guarda os municípios do RS que tocam a área processada do NISAR
(Fotos/nisar_taquari_50, -29,55 a -29,15 de latitude; -52,15 a -51,80 de longitude),
com uma folga de 0,05°. A API usa esse arquivo para somar a área de cheia por município.
"""

from __future__ import annotations

import gzip
import json
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "backend" / "app" / "data" / "vale_municipios.geojson"
MESH = ("https://servicodados.ibge.gov.br/api/v3/malhas/estados/43"
        "?formato=application/vnd.geo%2Bjson&qualidade=intermediaria&intrarregiao=municipio")
NAMES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/43/municipios"
COVER = (-52.15, -29.55, -51.80, -29.15)  # oeste, sul, leste, norte
PAD = 0.05


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "water-waltz-pipeline"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    if raw[:2] == b"\x1f\x8b":  # o IBGE às vezes responde em gzip sem pedir
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def rings(geom):
    if geom["type"] == "Polygon":
        yield from geom["coordinates"]
    else:
        for poly in geom["coordinates"]:
            yield from poly


def bbox(geom):
    xs = [p[0] for r in rings(geom) for p in r]
    ys = [p[1] for r in rings(geom) for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def rnd(geom):
    def r(ring):
        return [[round(x, 5), round(y, 5)] for x, y, *_ in ring]
    if geom["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [r(x) for x in geom["coordinates"]]}
    return {"type": "MultiPolygon", "coordinates": [[r(x) for x in p] for p in geom["coordinates"]]}


def main():
    names = {str(m["id"]): m["nome"] for m in get(NAMES)}
    mesh = get(MESH)
    w, s, e, n = COVER[0] - PAD, COVER[1] - PAD, COVER[2] + PAD, COVER[3] + PAD
    feats = []
    for f in mesh["features"]:
        x0, y0, x1, y1 = bbox(f["geometry"])
        if x1 < w or x0 > e or y1 < s or y0 > n:
            continue
        code = str(f["properties"]["codarea"])
        feats.append({"type": "Feature", "properties": {"id": code, "name": names.get(code, code)},
                      "geometry": rnd(f["geometry"])})
    feats.sort(key=lambda f: f["properties"]["name"])
    OUT.write_text(json.dumps({
        "type": "FeatureCollection",
        "source": "IBGE, malha municipal (API de malhas v3, qualidade intermediária)",
        "features": feats,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(feats)} municípios -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
