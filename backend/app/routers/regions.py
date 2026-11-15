from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import providers
from app.data.regions import REGIONS, bbox_to_wkt
from app.routers.deps import region_or_404
from app.providers.nisar import processed_scenes
from app.schemas import NisarEvent, NisarPasses, NisarProcessed, Recurrence, Region, RegionStatus, ScenesResponse
from app.services import asf, nisar_event, sentinel1
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


@router.get("/{region_id}/event", response_model=NisarEvent, summary="Evento NISAR mais recente",
            responses={404: {"description": "Região não encontrada ou sem evento processado"}})
def event(region: dict = Depends(region_or_404)):
    """Metadados do evento processado pela equipe: cenas de antes e depois (por dia), água total em cada
    uma e a água nova entre elas. A mancha da água nova sai em `/water-mask?date=<data_depois>`."""
    data = nisar_event.event_response(region["id"])
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum evento NISAR processado para esta região")
    return data


@router.get("/{region_id}/passes", response_model=NisarPasses, summary="Catálogo das passagens NISAR",
            responses={404: {"description": "Região não encontrada ou sem catálogo de passagens"}})
def passes(region: dict = Depends(region_or_404)):
    """Todas as passagens NISAR processadas pela equipe, com a área de água de cada uma por trilha, e as
    que foram descartadas. Não traz geometria. Diferente de `/nisar-processed`, que lista as manchas
    geradas por `scripts/process_nisar.py`."""
    data = nisar_event.passes_response(region["id"])
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma passagem NISAR catalogada para esta região")
    return data


@router.get("/{region_id}/recurrence", response_model=Recurrence, response_model_by_alias=True,
            summary="Recorrência de alagamento (histórico Sentinel-1)",
            responses={404: {"description": "Região não encontrada ou histórico ainda não processado"}})
def recurrence(region: dict = Depends(region_or_404),
               geometry: bool = Query(True, description="false devolve só os números, sem as manchas")):
    """Responde "recorrente ou pontual?": onde a água voltou várias vezes desde 2015 (arquivo gerado por
    `scripts/process_sentinel1.py`), a classe de cada cidade e a área alagada de cada mês."""
    data = sentinel1.load_recurrence(region["id"])
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Histórico Sentinel-1 ainda não processado para esta região")
    meta = data["metadata"]
    return {
        "region_id": region["id"],
        "source": "sentinel-1",
        "note": sentinel1.recurrence_note(meta),
        "period_start": meta["period"]["start"],
        "period_end": meta["period"]["end"],
        "images": meta["images"],
        "relative_orbit": meta["relative_orbit"],
        "orbit_pass": meta.get("orbit_pass"),
        "threshold_db": meta["threshold_db"],
        "classes": [f["properties"] for f in data["features"]],
        "cities": sentinel1.city_recurrence(data, region),
        "monthly": data["monthly"],
        "geojson": {"type": "FeatureCollection", "features": data["features"]} if geometry else None,
    }
