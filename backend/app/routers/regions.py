from fastapi import APIRouter, HTTPException, Query, status

from app.data.regions import REGIONS, bbox_to_wkt
from app.providers import get_provider
from app.services import asf, water

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


def _month(value: str, field: str) -> str:
    try:
        return water.parse_month(value, field)
    except water.InvalidMonth as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.get("/{region_id}/timeline")
async def region_timeline(
    region_id: str,
    start: str = Query("2022-01", description="Mês inicial (AAAA-MM)"),
    end: str | None = Query(None, description="Mês final (AAAA-MM). Padrão: mês atual"),
):
    region = _get_region(region_id)
    start = _month(start, "start")
    end = _month(end, "end") if end else water.current_month()
    if end < start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'end' deve ser depois de 'start'")
    return await water.timeline(get_provider(region_id), region, start, end)


@router.get("/{region_id}/water-mask")
def region_water_mask(region_id: str, date: str = Query(..., description="Mês (AAAA-MM)")):
    region = _get_region(region_id)
    return water.water_mask_geojson(get_provider(region_id), region, _month(date, "date"))


@router.get("/{region_id}/compare")
def region_compare(
    region_id: str,
    before: str = Query(..., description="Mês de antes (AAAA-MM)"),
    after: str = Query(..., description="Mês de depois (AAAA-MM)"),
):
    region = _get_region(region_id)
    before, after = _month(before, "before"), _month(after, "after")
    return water.compare(get_provider(region_id), region, before, after)
