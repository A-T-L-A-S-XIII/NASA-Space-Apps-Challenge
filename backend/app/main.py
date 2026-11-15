from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import SessionLocal, create_tables
from app.routers import api, auth, regions
from app.services.store import DatasetMissing
from app.services.users import ensure_seed_gov


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with SessionLocal() as db:
        ensure_seed_gov(db, settings.seed_gov_name, settings.seed_gov_email, settings.seed_gov_password)
    yield


app = FastAPI(
    title=settings.app_name,
    description="Serves precomputed radar water-change layers and statistics. "
                "Candidate water-change indicator — not a validated flood map.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError):
    # Mensagem principal em português; detalhes técnicos ficam em "errors"
    errors = [{k: v for k, v in e.items() if k != "ctx"} for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": "Dados inválidos", "errors": jsonable_encoder(errors)},
    )


@app.exception_handler(DatasetMissing)
async def dataset_missing(request, exc: DatasetMissing):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.include_router(auth.router)
app.include_router(regions.router)
app.include_router(api.router)


@app.get("/health")
def health():
    return {"status": "ok"}
