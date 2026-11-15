from fastapi import APIRouter, HTTPException, Query, status

from app.data.regions import REGIONS, bbox_to_wkt
from app.services import asf

router = APIRouter(prefix="/api/regions", tags=["regions"])


def _get_region(region_id: str) -> dict:
    region = REGIONS.get(region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Região não encontrada")
    return region


@router.get("")
def list_regions():
    return list(REGIONS.values())


@router.get("/{region_id}")
def get_region(region_id: str):
    return _get_region(region_id)


@router.get("/{region_id}/scenes")
async def region_scenes(
    region_id: str,
    start: str | None = Query(None, description="Data inicial (ISO 8601, ex.: 2026-01-01)"),
    end: str | None = Query(None, description="Data final (ISO 8601)"),
    product: str = Query("GCOV", pattern="^[A-Za-z0-9_]+$", description="Nível de processamento: GCOV, GUNW..."),
    limit: int = Query(25, ge=1, le=250),
):
    region = _get_region(region_id)
    result = await asf.search_scenes(
        bbox_to_wkt(region["bbox"]), product=product.upper(), start=start, end=end, limit=limit
    )
    return {
        "region_id": region_id,
        "live": result["live"],
        "count": len(result["scenes"]),
        "query": result["query"],
        "scenes": result["scenes"],
        "error": result["error"],
    }
