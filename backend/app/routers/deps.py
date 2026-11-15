from fastapi import HTTPException, Path, status

from app.data.regions import REGIONS


def region_or_404(region_id: str = Path(description="Id da região, ex.: vale-do-taquari")) -> dict:
    region = REGIONS.get(region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Região não encontrada")
    return region
