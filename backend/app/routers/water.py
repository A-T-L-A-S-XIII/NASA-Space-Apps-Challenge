from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import providers
from app.routers.deps import region_or_404
from app.schemas import Compare, RegionTimeline, WaterFrames, WaterMaskCollection
from app.services import water

router = APIRouter(prefix="/api/regions", tags=["Água"])

NOT_FOUND = {404: {"description": "Região não encontrada"}, 422: {"description": "Mês inválido"}}


def _month(value: str, field: str) -> str:
    try:
        return water.parse_month(value, field)
    except water.InvalidMonth as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.get("/{region_id}/timeline", response_model=RegionTimeline, summary="Linha do tempo mensal",
            responses=NOT_FOUND)
async def region_timeline(
    region: dict = Depends(region_or_404),
    start: str = Query("2022-01", description="Mês inicial (AAAA-MM)"),
    end: str | None = Query(None, description="Mês final (AAAA-MM). Padrão: mês atual"),
):
    """Área de água, anomalia, status, ONI e fase ENSO por mês. Dados do provider (hoje demo)."""
    start = _month(start, "start")
    end = _month(end, "end") if end else water.current_month()
    if end < start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'end' deve ser depois de 'start'")
    return await water.timeline(providers.get_provider(region["id"]), region, start, end)


@router.get("/{region_id}/water-mask", response_model=WaterMaskCollection, summary="Mancha d'água do mês",
            responses=NOT_FOUND)
def region_water_mask(region: dict = Depends(region_or_404), date: str = Query(..., description="Mês (AAAA-MM)")):
    """GeoJSON da mancha, com área em km² (calculada em UTM) e cidades atingidas."""
    return water.water_mask_geojson(providers.get_provider(region["id"]), region, _month(date, "date"))


@router.get("/{region_id}/water-mask/frames", response_model=WaterFrames,
            summary="Manchas de vários meses (linha do tempo animada)", responses=NOT_FOUND)
def region_water_frames(
    region: dict = Depends(region_or_404),
    start: str = Query("2022-01", description="Mês inicial (AAAA-MM)"),
    end: str | None = Query(None, description="Mês final (AAAA-MM). Padrão: mês atual"),
):
    """Todos os meses de uma vez, com a geometria simplificada para o payload ficar leve."""
    start = _month(start, "start")
    end = _month(end, "end") if end else water.current_month()
    if end < start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'end' deve ser depois de 'start'")
    if len(water.month_range(start, end)) > water.MAX_FRAMES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail=f"Peça no máximo {water.MAX_FRAMES} meses de uma vez")
    return water.frames(providers.get_provider(region["id"]), region, start, end)


@router.get("/{region_id}/compare", response_model=Compare, summary="Antes e depois", responses=NOT_FOUND)
async def region_compare(
    region: dict = Depends(region_or_404),
    before: str = Query(..., description="Mês de antes (AAAA-MM)"),
    after: str = Query(..., description="Mês de depois (AAAA-MM)"),
):
    """Duas manchas, a diferença de área e uma frase explicando a mudança para o cidadão.

    `browse_url` traz a imagem da cena NISAR (ASF) mais perto de cada mês, até 30 dias; senão, null.
    """
    before, after = _month(before, "before"), _month(after, "after")
    return await water.compare(providers.get_provider(region["id"]), region, before, after)
