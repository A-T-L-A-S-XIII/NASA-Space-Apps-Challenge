from fastapi import APIRouter, Depends, Query

from app import providers
from app.data.regions import REGIONS, bbox_to_wkt
from app.routers.deps import region_or_404
from app.providers.nisar import processed_scenes
from app.schemas import NisarProcessed, Region, RegionStatus, ScenesResponse
from app.services import asf
from app.services.status import region_status

router = APIRouter(prefix="/api/regions", tags=["Regiões"])


@router.get("", response_model=list[Region], summary="Lista as regiões monitoradas")
def list_regions():
    return list(REGIONS.values())


@router.get("/{region_id}", response_model=Region, summary="Detalhe da região",
            responses={404: {"description": "Região não encontrada"}})
def get_region(region: dict = Depends(region_or_404)):
    """Bbox, centro do mapa, cidades e traçado simplificado do rio."""
    return region


@router.get("/{region_id}/status", response_model=RegionStatus, summary="Resumo para o card principal",
            responses={404: {"description": "Região não encontrada"}})
async def get_region_status(region: dict = Depends(region_or_404)):
    """Status da água no mês atual, fase do ENSO mais recente e última cena NISAR, com um texto curto.

    A água vem do provider da região (hoje demo, com `source: "demo"`); ENSO (NOAA) e cenas (ASF)
    são ao vivo e, se falharem, voltam com `live: false` e `error`.
    """
    return await region_status(providers.get_provider(region["id"]), region)


@router.get("/{region_id}/scenes", response_model=ScenesResponse, summary="Cenas NISAR ao vivo (ASF)",
            responses={404: {"description": "Região não encontrada"}})
async def region_scenes(
    region: dict = Depends(region_or_404),
    start: str | None = Query(None, description="Data inicial (ISO 8601, ex.: 2026-01-01)"),
    end: str | None = Query(None, description="Data final (ISO 8601)"),
    product: str = Query("GCOV", pattern="^[A-Za-z0-9_]+$", description="Nível de processamento: GCOV, GUNW..."),
    limit: int = Query(25, ge=1, le=250),
):
    """Busca no catálogo público do ASF DAAC (sem login), com cache de 30 min."""
    result = await asf.search_scenes(
        bbox_to_wkt(region["bbox"]), product=product.upper(), start=start, end=end, limit=limit
    )
    return {
        "region_id": region["id"],
        "live": result["live"],
        "count": len(result["scenes"]),
        "query": result["query"],
        "scenes": result["scenes"],
        "error": result["error"],
        "snapshot_date": result.get("snapshot_date"),
    }


@router.get("/{region_id}/nisar-processed", response_model=NisarProcessed, summary="Cenas NISAR já processadas",
            responses={404: {"description": "Região não encontrada"}})
def nisar_processed(region: dict = Depends(region_or_404)):
    """Manchas reais geradas por `scripts/process_nisar.py`. Nos meses delas, `/water-mask` e `/compare`
    usam o dado real com `source: "nisar"`."""
    scenes = [{k: v for k, v in s.items() if k != "geometry"} for s in processed_scenes(region["id"])]
    scenes.reverse()
    return {"region_id": region["id"], "count": len(scenes), "scenes": scenes}
