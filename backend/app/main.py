from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import SessionLocal, create_tables
from app.routers import alerts, api, auth, climate, explain, regions, water
from app.schemas import Health
from app.services.store import DatasetMissing
from app.services.alerts import ensure_demo_alerts
from app.services.users import ensure_seed_gov, ensure_seed_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with SessionLocal() as db:
        ensure_seed_gov(db, settings.seed_gov_name, settings.seed_gov_email, settings.seed_gov_password)
        ensure_demo_alerts(db, settings.seed_gov_email)
        ensure_seed_user(db, settings.demo_user_name, settings.demo_user_email, settings.demo_user_password,
                         role="cidadao", city=settings.demo_user_city)
    yield


TAGS = [
    {"name": "Sistema", "description": "Saúde da API."},
    {"name": "Autenticação", "description": "Cadastro, login e contas do governo."},
    {"name": "Regiões", "description": "Regiões monitoradas, resumo do card principal e cenas NISAR ao vivo do ASF."},
    {"name": "Água", "description": "Linha do tempo, mancha d'água e antes/depois. "
                                   "Hoje vêm do DemoProvider: dados ilustrativos com `source: \"demo\"`."},
    {"name": "Alertas", "description": "Alertas do governo (criar e desativar só com role `governo`), "
                                       "exportação em CSV e status da cidade do cidadão."},
    {"name": "Clima", "description": "Índice ONI (El Niño / La Niña) ao vivo da NOAA."},
    {"name": "Explicações", "description": "Textos em português simples para o cidadão."},
    {"name": "Radar processado", "description": "Camadas e estatísticas de radar processadas antes, fora da API "
                                                "(`data/demo` ou `data/fixtures`)."},
]

app = FastAPI(
    title=settings.app_name,
    description="API do Water Waltz: secas e enchentes no Vale do Taquari (RS) com radar NISAR.\n\n"
                "Indicador de mudança de água candidata a partir de radar: **não é um mapa validado de "
                "enchente**, não é previsão e não serve para decidir rota ou evacuação. "
                "Todo dado ilustrativo vem marcado com `source: \"demo\"` ou `fixture: true`.",
    openapi_tags=TAGS,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
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
app.include_router(water.router)
app.include_router(climate.router)
app.include_router(explain.router)
app.include_router(alerts.router)
app.include_router(api.router)


@app.get("/health", response_model=Health, tags=["Sistema"], summary="Saúde da API")
def health():
    return {"status": "ok"}
