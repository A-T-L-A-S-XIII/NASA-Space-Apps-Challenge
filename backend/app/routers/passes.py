from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from app.routers.deps import region_or_404
from app.schemas import MunicipalitiesArea, MunicipalityMesh, PassGeoJSON, Passes
from app.services import export, municipalities
from app.services import passes as passes_service

router = APIRouter(prefix="/api/regions", tags=["Passagens NISAR"])
static_router = APIRouter(prefix="/api/static/nisar", tags=["Passagens NISAR"])

MONTH = Query(None, pattern=r"^\d{4}-\d{2}$", description="Mês (AAAA-MM). Vazio = todas as passagens")
NO_PASSES = {404: {"description": "Região não encontrada ou sem passagens processadas"}}
PNG_FILE = {200: {"content": {"image/png": {}}, "description": "Imagem PNG"}, 404: {"description": "Não encontrada"}}


def passes_or_404(region: dict = Depends(region_or_404)) -> list[dict]:
    passes = passes_service.catalog(region["id"])
    if passes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Ainda não há passagens NISAR processadas para esta região")
    return passes


def mesh_or_404() -> dict:
    mesh = municipalities.load_mesh()
    if mesh is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Malha municipal ainda não gerada")
    return mesh


@router.get("/{region_id}/passes", response_model=Passes, summary="Passagens NISAR processadas",
            responses=NO_PASSES)
def list_passes(region: dict = Depends(region_or_404), passes: list[dict] = Depends(passes_or_404),
                month: str | None = MONTH):
    """Área de água, cheia e seca de cada passagem, com as URLs relativas das imagens (radar e painel).
    Só compare passagens da mesma trilha."""
    return passes_service.list_passes(region, passes, month)


@router.get("/{region_id}/passes/{n}/geojson", response_model=PassGeoJSON, response_model_by_alias=True,
            summary="Polígonos de cheia e seca de uma passagem", responses=NO_PASSES)
def pass_geojson(n: int, region: dict = Depends(region_or_404), passes: list[dict] = Depends(passes_or_404)):
    p = passes_service.find(passes, n)
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Passagem {n} não encontrada")
    return passes_service.pass_geojson(region, p)


@router.get("/{region_id}/municipalities", response_model=MunicipalitiesArea,
            summary="Área de cheia e seca por município", responses=NO_PASSES)
def by_municipality(region: dict = Depends(region_or_404), passes: list[dict] = Depends(passes_or_404),
                    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Mês (AAAA-MM)"),
                    _: dict = Depends(mesh_or_404)):
    """Cada polígono vai para o município que contém o seu centro (malha do IBGE). A área processada
    cobre só parte de cada município."""
    return municipalities.by_municipality(region, passes, month)


@router.get("/{region_id}/municipalities/geojson", response_model=MunicipalityMesh,
            summary="Malha municipal (IBGE)", responses={404: {"description": "Região ou malha não encontrada"}})
def municipality_mesh(region: dict = Depends(region_or_404), mesh: dict = Depends(mesh_or_404)):
    return municipalities.mesh_geojson(region, mesh)


@router.get("/{region_id}/export", summary="Exportar passagens (JSON, CSV ou GeoJSON)",
            responses={**NO_PASSES, 200: {"content": {"application/json": {}, "text/csv": {}, "application/geo+json": {}},
                                          "description": "Arquivo para baixar, com procedência"}})
def export_passes(region: dict = Depends(region_or_404), passes: list[dict] = Depends(passes_or_404),
                  format: Literal["json", "csv", "geojson"] = Query("json", description="Formato do arquivo"),
                  month: str | None = MONTH):
    """Só dados públicos do radar, com procedência (grânulos, CRS, unidades e cuidados).
    Nenhum dado de usuário entra no arquivo, e a rota não exige login."""
    headers = {"Content-Disposition": f'attachment; filename="{export.filename(region, month, format)}"'}
    if format == "csv":
        return PlainTextResponse(export.as_csv(region, passes, month), media_type="text/csv; charset=utf-8",
                                 headers=headers)
    if format == "geojson":
        return JSONResponse(export.as_geojson(region, passes, month), media_type="application/geo+json",
                            headers=headers)
    return JSONResponse(export.as_json(region, passes, month), headers=headers)


@static_router.get("/{folder}/{name}", response_class=FileResponse, responses=PNG_FILE,
                   summary="Imagem de uma passagem (miniatura.png ou slide.png)")
def pass_image(folder: str, name: str):
    """Arquivos de NISAR_FOTOS_DIR. Só as pastas img_* e só as imagens das passagens."""
    path = passes_service.image_path(folder, name)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não encontrada")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
