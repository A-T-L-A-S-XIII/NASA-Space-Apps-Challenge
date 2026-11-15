from fastapi import APIRouter, Query

from app.services import enso

router = APIRouter(prefix="/api/climate", tags=["climate"])


@router.get("/enso")
async def get_enso(start: str | None = Query(None, pattern=r"^\d{4}-\d{2}$", description="Só meses a partir deste (AAAA-MM)")):
    data = await enso.get_enso()
    series = [p for p in data["series"] if not start or p["month"] >= start]
    return {
        "live": data["live"],
        "source": data["source"],
        "url": data["url"],
        "fetched_at": data["fetched_at"],
        "latest": data["series"][-1] if data["series"] else None,
        "count": len(series),
        "series": series,
        "error": data["error"],
    }
