from fastapi import APIRouter, HTTPException, Query, status

from app.data.regions import REGIONS
from app.schemas import Places
from app.services import places

router = APIRouter(prefix="/api", tags=["Busca"])


@router.get("/places", response_model=Places, summary="Busca de municípios e bairros",
            responses={404: {"description": "Região não encontrada"}})
async def search_places(q: str = Query(..., min_length=2, max_length=80, description="Texto digitado"),
                        region_id: str = Query("vale-do-taquari", description="Ex.: vale-do-taquari")):
    """Municípios da malha do IBGE (local) e bairros do OpenStreetMap (Nominatim, a partir de 3 letras).

    Cada item diz se fica dentro da área observada pelo radar. Se o Nominatim falhar, os municípios
    continuam saindo e `error` explica a falha.
    """
    region = REGIONS.get(region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Região não encontrada")
    return await places.search(q, region)
