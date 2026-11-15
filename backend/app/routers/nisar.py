"""Rotas do Vale do Taquari: passagens NISAR processadas, previsão e busca de lugares."""

from __future__ import annotations

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from app.data.regions import REGIONS
from app.services import contexto
from app.services.nisar import VEGETACAO_ALAGADA, Nisar, get_nisar

router = APIRouter(prefix="/api", tags=["vale-do-taquari"])
MES = Query("2026-07", pattern=r"^\d{4}-\d{2}$", description="Mês no formato AAAA-MM")
CAMPOS_CSV = ["n", "data", "trilha", "pol", "agua_km2", "cheia_km2", "seca_km2",
              "na_janela_da_enchente", "granulo", "fonte"]


def _passagem(nisar: Nisar, n: int) -> dict:
    p = nisar.passagem(n)
    if p is None:
        raise HTTPException(404, f"Passagem {n} não encontrada")
    return p


@router.get("/nisar/passagens")
def passagens(mes: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), nisar: Nisar = Depends(get_nisar)):
    ps = nisar.do_mes(mes) if mes else nisar.catalog
    return {"mes": mes, "meses": nisar.meses(), "area_coberta": nisar.cover,
            "itens": [nisar.passagem(p["n"]) for p in ps]}


@router.get("/nisar/passagens/{n}")
def passagem(n: int, nisar: Nisar = Depends(get_nisar)):
    return _passagem(nisar, n)


@router.get("/nisar/passagens/{n}/geojson")
def passagem_geojson(n: int, download: bool = False, nisar: Nisar = Depends(get_nisar)):
    p = _passagem(nisar, n)
    fc = nisar.geojson(n)
    if fc is None:
        raise HTTPException(404, f"Sem GeoJSON para a passagem {n}")
    headers = {"Content-Disposition": f'attachment; filename="nisar_taquari_{p["data"]}.geojson"'} if download else None
    return JSONResponse(fc, media_type="application/geo+json", headers=headers)


@router.get("/nisar/passagens/{n}/imagem/{tipo}")
def passagem_imagem(n: int, tipo: Literal["radar", "slide"], nisar: Nisar = Depends(get_nisar)):
    _passagem(nisar, n)
    p = nisar.imagem(n, tipo)
    if p is None:
        raise HTTPException(404, "Imagem não encontrada")
    return FileResponse(p, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/nisar/resumo")
def resumo(mes: str = MES, nisar: Nisar = Depends(get_nisar)):
    return nisar.resumo(mes)


@router.get("/nisar/municipios")
def municipios(mes: str = MES, nisar: Nisar = Depends(get_nisar)):
    return nisar.por_municipio(mes)


@router.get("/nisar/municipios/geojson")
def municipios_geojson(nisar: Nisar = Depends(get_nisar)):
    return JSONResponse(nisar.municipios, media_type="application/geo+json")


@router.get("/nisar/metadados")
def metadados(nisar: Nisar = Depends(get_nisar)):
    return nisar.metadados()


@router.get("/nisar/vegetacao-alagada")
def vegetacao_alagada():
    # Ainda não existe dado: as cenas processadas são só HH. A rota responde isso de forma explícita.
    return JSONResponse(VEGETACAO_ALAGADA, status_code=501)


@router.get("/nisar/geojson")
def geojson_mes(mes: str = MES, download: bool = False, nisar: Nisar = Depends(get_nisar)):
    feats = []
    for p in nisar.do_mes(mes):
        feats += (nisar.geojson(p["n"]) or {"features": []})["features"]
    fc = {"type": "FeatureCollection", "mes": mes, "fonte": "NASA/ISRO NISAR via ASF DAAC",
          "aviso": "Indicador de mudança de água pelo radar; não é um mapa de inundação validado.",
          "features": feats}
    headers = {"Content-Disposition": f'attachment; filename="nisar_taquari_{mes}.geojson"'} if download else None
    return JSONResponse(fc, media_type="application/geo+json", headers=headers)


@router.get("/nisar/exportar")
def exportar(formato: Literal["csv", "json"] = "csv", mes: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
             nisar: Nisar = Depends(get_nisar)):
    ps = nisar.do_mes(mes) if mes else nisar.catalog
    nome = f"nisar_taquari_{mes or 'todas'}"
    if formato == "json":
        body = {"mes": mes, "metadados": nisar.metadados(), "passagens": ps,
                "municipios": nisar.por_municipio(mes)["municipios"] if mes else None}
        return JSONResponse(body, headers={"Content-Disposition": f'attachment; filename="{nome}.json"'})
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CAMPOS_CSV, extrasaction="ignore")
    w.writeheader()
    w.writerows(ps)
    return PlainTextResponse(buf.getvalue(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{nome}.csv"'})


@router.get("/previsao")
async def previsao(lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180),
                   dias: int = Query(7, ge=1, le=16)):
    if lat is None or lon is None:
        lat, lon = REGIONS["vale-do-taquari"]["center"]
    try:
        return await contexto.previsao(lat, lon, dias)
    except contexto.ExternalError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/lugares")
async def lugares(q: str = Query(..., min_length=2, max_length=80)):
    return await contexto.lugares(q)
