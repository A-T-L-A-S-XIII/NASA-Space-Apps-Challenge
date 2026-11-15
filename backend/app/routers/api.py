from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from ..schemas import Exposure, LayerSet, Localities, Stats, Timeline
from ..services.downloads import stats_csv, stats_geojson
from ..services.exposure import compute_exposure, flagged_road_ids
from ..services.store import REPO, Dataset, get_dataset

router = APIRouter(prefix="/api")


@router.get("/timeline", response_model=Timeline)
def timeline(ds: Dataset = Depends(get_dataset)):
    return ds.timeline


@router.get("/aoi")
def aoi():
    return FileResponse(REPO / "data" / "aoi.geojson", media_type="application/geo+json")


@router.get("/grid")
def grid(ds: Dataset = Depends(get_dataset)):
    return FileResponse(ds.root / "grid.json", media_type="application/json")


@router.get("/access")
def access(ds: Dataset = Depends(get_dataset)):
    return ds.access or {"type": "FeatureCollection", "features": []}


@router.get("/road-flags")
def road_flags(ds: Dataset = Depends(get_dataset)):
    """date_id -> ids of road segments crossing candidate water on that date."""
    return {e["date_id"]: flagged_road_ids(ds, e["date_id"]) for e in ds.timeline["entries"]}


@router.get("/bulletins")
def bulletins(ds: Dataset = Depends(get_dataset)):
    return ds.bulletins


@router.get("/layers/{date_id}", response_model=LayerSet)
def layers(date_id: str, ds: Dataset = Depends(get_dataset)):
    ls = ds.layer_set(date_id)
    if ls is None:
        raise HTTPException(404, f"No layers for date_id '{date_id}'")
    return ls


@router.get("/files/{path:path}")
def files(path: str, ds: Dataset = Depends(get_dataset)):
    p = ds.file(path) if path.startswith("layers/") and path.endswith(".png") else None
    if p is None:
        raise HTTPException(404, "File not found")
    return FileResponse(p, media_type="image/png")


@router.get("/exposure", response_model=Exposure)
def exposure(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180),
             ds: Dataset = Depends(get_dataset)):
    return compute_exposure(ds, lat, lon)


@router.get("/stats", response_model=Stats)
def stats(ds: Dataset = Depends(get_dataset)):
    return ds.stats


@router.get("/localities", response_model=Localities)
def localities(ds: Dataset = Depends(get_dataset)):
    return ds.localities


@router.get("/download/{kind}")
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
