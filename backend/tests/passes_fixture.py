"""Pasta de passagens NISAR de teste (formato de Fotos/nisar_taquari_50), montada em tmp_path."""

import json

import pytest
from shapely.geometry import box, mapping

from app.config import settings

COVER = [[-29.55, -52.15], [-29.15, -51.80]]  # limites_leaflet: [[sul, oeste], [norte, leste]]
# Quadrado de ~200 m no centro de Lajeado e outro perto de Encantado
LAJEADO_BOX = box(-51.963, -29.469, -51.961, -29.467)
ENCANTADO_BOX = box(-51.872, -29.238, -51.870, -29.236)
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


def make_pass(n, date, track="053_D_103", agua=3.0, cheia=0.0, seca=0.0, janela=False):
    return {"n": n, "data": date, "trilha": track, "pol": "HH", "passagens_na_orbita": 10, "agua_km2": agua,
            "cheia_km2": cheia, "seca_km2": seca, "na_janela_da_enchente": janela, "limites_leaflet": COVER,
            "fonte": "NASA/ISRO NISAR via ASF DAAC",
            "granulo": f"NISAR_L2_PR_GCOV_025_{track}_4005_DHDH_A_{date.replace('-', '')}T213351_X_001"}


def write_folder(root, p, features=(), images=True):
    folder = root / f"img_{p['n']:02d}_{p['data']}"
    folder.mkdir()
    fc = {"type": "FeatureCollection",
          "features": [{"type": "Feature", "properties": {"classe": cls}, "geometry": mapping(geom)}
                       for cls, geom in features]}
    (folder / "area_cheia_seca.geojson").write_text(json.dumps(fc), encoding="utf-8")
    (folder / "dados.json").write_text(json.dumps(p), encoding="utf-8")
    if images:
        (folder / "miniatura.png").write_bytes(PNG)
        (folder / "slide.png").write_bytes(PNG)


@pytest.fixture
def fotos_dir(tmp_path, monkeypatch):
    """Três passagens: junho sem nada, julho com cheia em Lajeado e seca em Encantado, julho sem imagens."""
    passes = [make_pass(1, "2026-06-17"),
              make_pass(2, "2026-07-11", cheia=0.05, seca=0.04, janela=True),
              make_pass(3, "2026-07-23", track="103_A_163", agua=8.1)]
    (tmp_path / "catalogo.json").write_text(json.dumps(passes), encoding="utf-8")
    (tmp_path / "catalogo.csv").write_text("n,data\n", encoding="utf-8")
    write_folder(tmp_path, passes[0])
    write_folder(tmp_path, passes[1], [("cheia", LAJEADO_BOX), ("seca", ENCANTADO_BOX), ("outra", LAJEADO_BOX)])
    write_folder(tmp_path, passes[2], images=False)
    monkeypatch.setattr(settings, "nisar_fotos_dir", str(tmp_path))
    yield tmp_path
