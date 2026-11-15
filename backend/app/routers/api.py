from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from ..schemas import Exposure, FeatureCollection, LayerSet, Localities, Stats, Timeline
from ..services.downloads import stats_csv, stats_geojson
from ..services.exposure import compute_exposure
from ..services.store import REPO, Dataset, get_dataset

router = APIRouter(prefix="/api", tags=["Radar processado"])

# Rotas que devolvem arquivo (GeoJSON, JSON, PNG, CSV) não têm response_model:
# o corpo é o próprio arquivo, documentado em "responses".
GEOJSON_FILE = {200: {"content": {"application/geo+json": {}}, "description": "Arquivo GeoJSON"}}
PNG_FILE = {200: {"content": {"image/png": {}}, "description": "Imagem PNG"}}


@router.get("/timeline", response_model=Timeline, summary="Datas de radar processadas")
def timeline(ds: Dataset = Depends(get_dataset)):
    return ds.timeline


@router.get("/aoi", response_class=FileResponse, responses=GEOJSON_FILE, summary="Área de estudo (GeoJSON)")
def aoi():
    return FileResponse(REPO / "data" / "aoi.geojson", media_type="application/geo+json")


@router.get("/grid", response_class=FileResponse,
            responses={200: {"content": {"application/json": {}}, "description": "grid.json"}},
            summary="Grade de estados por data")
def grid(ds: Dataset = Depends(get_dataset)):
    return FileResponse(ds.root / "grid.json", media_type="application/json")


@router.get("/access", response_model=FeatureCollection, summary="Estradas e pontes (GeoJSON)")
def access(ds: Dataset = Depends(get_dataset)):
    return ds.access or {"type": "FeatureCollection", "features": []}


@router.get("/layers/{date_id}", response_model=LayerSet, summary="Camadas de uma data")
def layers(date_id: str, ds: Dataset = Depends(get_dataset)):
    ls = ds.layer_set(date_id)
    if ls is None:
        raise HTTPException(404, f"No layers for date_id '{date_id}'")
    return ls


@router.get("/files/{path:path}", response_class=FileResponse, responses=PNG_FILE, summary="PNG de uma camada")
def files(path: str, ds: Dataset = Depends(get_dataset)):
    p = ds.file(path) if path.startswith("layers/") and path.endswith(".png") else None
    if p is None:
        raise HTTPException(404, "File not found")
    return FileResponse(p, media_type="image/png")


@router.get("/exposure", response_model=Exposure, summary="Minha área foi atingida? (um ponto)")
def exposure(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180),
             ds: Dataset = Depends(get_dataset)):
    return compute_exposure(ds, lat, lon)


@router.get("/stats", response_model=Stats, summary="Área de água por data e por localidade")
def stats(ds: Dataset = Depends(get_dataset)):
    return ds.stats


@router.get("/localities", response_model=Localities, summary="Localidades para a busca")
def localities(ds: Dataset = Depends(get_dataset)):
    return ds.localities


@router.get("/download/{kind}", response_class=FileResponse, summary="Downloads (GeoJSON, CSV ou PNG)",
            responses={200: {"content": {"application/geo+json": {}, "text/csv": {}, "image/png": {}},
                             "description": "Arquivo para baixar"}})
def download(kind: Literal["geojson", "csv", "png"], date_id: str | None = None,
             ds: Dataset = Depends(get_dataset)):
    if kind == "geojson":
        return JSONResponse(stats_geojson(ds), media_type="application/geo+json",
                            headers={"Content-Disposition": 'attachment; filename="stats.geojson"'})
    if kind == "csv":
        return PlainTextResponse(stats_csv(ds), media_type="text/csv",
                                 headers={"Content-Disposition": 'attachment; filename="stats.csv"'})
    if not date_id:
        raise HTTPException(422, "png download needs ?date_id=")
    p = ds.file(f"layers/{date_id}_water.png")
    if p is None:
        raise HTTPException(404, f"No PNG for date_id '{date_id}'")
    return FileResponse(p, media_type="image/png", filename=f"{date_id}_water.png")
