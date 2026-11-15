from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import providers
from app.data.regions import REGIONS, find_city
from app.db import Alert, User, get_db
from app.routers.deps import region_or_404
from app.schemas import AlertCreate, AlertOut, AlertUpdate, CityStatus
from app.security import get_current_user, require_gov
from app.services import alerts, water
from app.services.status import city_status

router = APIRouter(tags=["Alertas"])

FORBIDDEN = {401: {"description": "Não autenticado"}, 403: {"description": "Só usuários do governo"}}


def _check_place(region_id: str, city_id: str | None):
    region = REGIONS.get(region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Região não encontrada")
    if city_id and city_id not in {c["id"] for c in region["cities"]}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cidade não encontrada nesta região")


@router.get("/api/alerts", response_model=list[AlertOut], summary="Alertas ativos (público)")
def list_alerts(
    region_id: str | None = Query(None, description="Ex.: vale-do-taquari"),
    city_id: str | None = Query(None, description="Ex.: lajeado. Inclui os alertas da região inteira"),
    db: Session = Depends(get_db),
):
    """Mais recentes primeiro. Alertas com `source: "demo"` são exemplos, não avisos reais."""
    return alerts.list_alerts(db, region_id, city_id)


@router.post("/api/alerts", response_model=AlertOut, status_code=status.HTTP_201_CREATED,
             summary="Cria alerta (só governo)", responses=FORBIDDEN)
def create_alert(data: AlertCreate, db: Session = Depends(get_db), user: User = Depends(require_gov)):
    _check_place(data.region_id, data.city_id)
    return alerts.create_alert(db, data.model_dump(), user)


@router.patch("/api/alerts/{alert_id}", response_model=AlertOut, summary="Desativa ou reativa alerta (só governo)",
              responses={**FORBIDDEN, 404: {"description": "Alerta não encontrado"}})
def update_alert(alert_id: int, data: AlertUpdate, db: Session = Depends(get_db), _: User = Depends(require_gov)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta não encontrado")
    return alerts.set_active(db, alert, data.active)


@router.get("/api/gov/export/{region_id}.csv", response_class=PlainTextResponse,
            summary="Linha do tempo em CSV (só governo)",
            responses={**FORBIDDEN, 200: {"content": {"text/csv": {}}, "description": "Arquivo CSV"}})
async def export_timeline(
    region: dict = Depends(region_or_404),
    start: str = Query("2022-01", description="Mês inicial (AAAA-MM)"),
    end: str | None = Query(None, description="Mês final (AAAA-MM). Padrão: mês atual"),
    _: User = Depends(require_gov),
):
    """Colunas: data, area_km2, anomalia_pct, status, oni, fase_enso, fonte ("demo" para dado ilustrativo)."""
    try:
        start = water.parse_month(start, "start")
        end = water.parse_month(end, "end") if end else water.current_month()
    except water.InvalidMonth as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    if end < start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="'end' deve ser depois de 'start'")
    data = await water.timeline(providers.get_provider(region["id"]), region, start, end)
    filename = f"{region['id']}_{start}_{end}.csv"
    return PlainTextResponse(water.timeline_csv(data), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/api/me/city-status", response_model=CityStatus, summary="Status da minha cidade",
            responses={401: {"description": "Não autenticado"},
                       404: {"description": "Cidade não cadastrada ou não monitorada"}})
def my_city_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """A cidade do cadastro está dentro da mancha d'água do mês mais recente? Mais os alertas ativos dela."""
    if not user.city:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cadastre sua cidade para ver o status")
    found = find_city(user.city)
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"A cidade '{user.city}' ainda não é monitorada pelo Water Waltz")
    region, city = found
    active = [AlertOut.model_validate(a) for a in alerts.list_alerts(db, region["id"], city["id"])]
    return city_status(providers.get_provider(region["id"]), region, city, active)
