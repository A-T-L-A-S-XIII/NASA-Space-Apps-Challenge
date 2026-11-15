from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import api
from .services.store import DatasetMissing

app = FastAPI(
    title="Taquari Flood Watch API",
    description="Serves precomputed radar water-change layers and statistics. "
                "Candidate water-change indicator — not a validated flood map.",
    version="0.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["GET"])
app.include_router(api.router)


@app.exception_handler(DatasetMissing)
def _missing(_, exc: DatasetMissing):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/health")
def health():
    return {"status": "ok"}
