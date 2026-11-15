from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import providers
from app.routers.deps import region_or_404
from app.schemas import Compare, RegionTimeline, WaterFrames, WaterMaskCollection
from app.services import water

router = APIRouter(prefix="/api/regions", tags=["Água"])

NOT_FOUND = {404: {"description": "Região não encontrada"}, 422: {"description": "Data inválida"}}
DATE_HELP = "AAAA-MM ou AAAA-MM-DD"


def _date(value: str, field: str) -> str:
    try:
        return water.parse_date(value, field)
    except water.InvalidMonth as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


def _range(start: str, end: str | None) -> tuple[str, str]:
    start = _date(start, "start")
    end = _date(end, "end") if end else water.current_month()
    lo, hi = water.day_bounds(start, end)
    if hi < lo:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'end' deve ser depois de 'start'")
    return start, end


# exclude_unset: `track` só aparece na série por dia (a série mensal segue com os mesmos campos de antes)
@router.get("/{region_id}/timeline", response_model=RegionTimeline, response_model_exclude_unset=True,
            summary="Linha do tempo (por mês ou por passagem)", responses=NOT_FOUND)
async def region_timeline(
    region: dict = Depends(region_or_404),
    start: str = Query("2022-01", description=f"Início ({DATE_HELP})"),
    end: str | None = Query(None, description=f"Fim ({DATE_HELP}). Padrão: mês atual"),
):
    """Área de água, anomalia, status, ONI e fase ENSO.

    Com AAAA-MM: um ponto por mês, do provider (demo, ou NISAR nos meses com cena processada).
    Com AAAA-MM-DD em `start` ou `end`: um ponto por passagem do catálogo NISAR no intervalo, com a trilha.
    """
    start, end = _range(start, end)
    return await water.timeline(providers.get_provider(region["id"]), region, start, end)


@router.get("/{region_id}/water-mask", response_model=WaterMaskCollection, summary="Mancha d'água do mês ou do dia",
            responses=NOT_FOUND)
def region_water_mask(region: dict = Depends(region_or_404), date: str = Query(..., description=DATE_HELP)):
    """GeoJSON da mancha, com área em km² (calculada em UTM) e cidades atingidas.

    Nos dias das cenas do evento NISAR vem o dado real. Um dia sem passagem real volta como o mês dele
    (veja `date` na resposta).
    """
    return water.water_mask_geojson(providers.get_provider(region["id"]), region, _date(date, "date"))


@router.get("/{region_id}/water-mask/frames", response_model=WaterFrames,
            summary="Manchas de vários meses ou dias (linha do tempo animada)", responses=NOT_FOUND)
def region_water_frames(
    region: dict = Depends(region_or_404),
    start: str = Query("2022-01", description=f"Início ({DATE_HELP})"),
    end: str | None = Query(None, description=f"Fim ({DATE_HELP}). Padrão: mês atual"),
):
    """Todos os meses de uma vez, com a geometria simplificada para o payload ficar leve.

    Com AAAA-MM-DD, só os dias com mancha de passagem real no intervalo.
    """
    start, end = _range(start, end)
    by_month = not (water.is_day(start) or water.is_day(end))
    if by_month and len(water.month_range(start, end)) > water.MAX_FRAMES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail=f"Peça no máximo {water.MAX_FRAMES} meses de uma vez")
    return water.frames(providers.get_provider(region["id"]), region, start, end)


@router.get("/{region_id}/compare", response_model=Compare, summary="Antes e depois", responses=NOT_FOUND)
async def region_compare(
    region: dict = Depends(region_or_404),
    before: str = Query(..., description=f"Antes ({DATE_HELP})"),
    after: str = Query(..., description=f"Depois ({DATE_HELP})"),
):
    """Duas manchas, a diferença de área e uma frase explicando a mudança para o cidadão.

    Com as datas do evento NISAR (`before=2026-07-11&after=2026-07-23`), o delta é a água nova entre as
    cenas. `browse_url` traz a imagem da cena NISAR (ASF) mais perto de cada data, até 30 dias; senão, null.
    """
    before, after = _date(before, "before"), _date(after, "after")
    return await water.compare(providers.get_provider(region["id"]), region, before, after)
