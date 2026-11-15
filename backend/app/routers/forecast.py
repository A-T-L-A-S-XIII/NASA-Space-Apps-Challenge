from fastapi import APIRouter, Depends, Query

from app.routers.deps import region_or_404
from app.schemas import Forecast
from app.services import forecast

router = APIRouter(prefix="/api/regions", tags=["Previsão"])


@router.get("/{region_id}/forecast", response_model=Forecast, summary="Previsão do tempo (Open-Meteo)",
            responses={404: {"description": "Região não encontrada"}})
async def region_forecast(region: dict = Depends(region_or_404),
                          days: int = Query(7, ge=1, le=16, description="Dias de previsão")):
    """Chuva e temperatura por dia no centro da região. É previsão do tempo, **não de enchente**.

    Cache de 30 min. Se a Open-Meteo falhar, responde 200 com `live: false`, o último cache (se houver) e `error`.
    """
    return await forecast.get_forecast(region, days)
