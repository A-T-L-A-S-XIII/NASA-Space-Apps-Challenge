from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from pydantic import field_validator
from typing import Annotated
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Water Waltz API"
    database_url: str = "sqlite:///./water_waltz.db"

    # Origens liberadas no CORS, separadas por vírgula no .env. Quem chama a API é o servidor do Next.js:
    # libere só o Next local e, em produção, a URL do Next
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Regex opcional, ex.: https://water-waltz.*\.vercel\.app (libera os previews da Vercel)
    cors_origin_regex: str | None = None

    # Obrigatória: a API não inicia sem uma chave forte (veja check_jwt_secret)
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Conta governo criada no startup se ainda não existir
    seed_gov_name: str = "Governo RS"
    seed_gov_email: str = "governo@waterwaltz.dev"
    # Sem senha forte definida, a conta governo semente NÃO é criada (veja services/users.py)
    seed_gov_password: str = ""

    # Conta de demonstração (cidadão) criada no startup se ainda não existir: a única que o frontend usa
    demo_user_name: str = "Conta de demonstração"
    demo_user_email: str = "demo@waterwaltz.dev"
    demo_user_password: str = "troque-esta-senha"
    demo_user_city: str = "Lajeado"  # uma das cidades do Vale do Taquari: o app abre nela

    # Catálogo público do ASF DAAC (busca não exige login Earthdata)
    asf_search_url: str = "https://api.daac.asf.alaska.edu/services/search/param"
    asf_timeout_seconds: float = 30
    asf_cache_ttl_seconds: int = 30 * 60

    # Índice ONI (El Niño / La Niña) da NOAA
    noaa_oni_url: str = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
    enso_timeout_seconds: float = 15
    enso_cache_ttl_seconds: int = 6 * 60 * 60
    enso_retry_seconds: int = 5 * 60  # depois de uma falha, espera isso antes de tentar a NOAA de novo

    # Modo offline (pitch sem internet): ASF e NOAA são lidos dos snapshots salvos por scripts/snapshot.py.
    # Mesmo com false, se a fonte ao vivo falhar e houver snapshot, ele é usado (live: false).
    offline_mode: bool = False
    snapshot_dir: str = str(Path(__file__).resolve().parent / "data" / "snapshots")

    # Manchas reais do NISAR geradas por scripts/process_nisar.py
    nisar_dir: str = str(Path(__file__).resolve().parent / "data" / "nisar")
    # Recorrência do histórico Sentinel-1 gerada por scripts/process_sentinel1.py
    sentinel1_dir: str = str(Path(__file__).resolve().parent / "data" / "sentinel1")
    # Passagens NISAR já processadas, com imagens e polígonos de cheia/seca (catalogo.json + pastas img_*)
    nisar_fotos_dir: str = str(Path(__file__).resolve().parents[2] / "Fotos" / "nisar_taquari_50")
    # Malha municipal do IBGE gerada por pipeline/build_vale_municipios.py
    municipalities_file: str = str(Path(__file__).resolve().parent / "data" / "vale_municipios.geojson")

    # Previsão do tempo da Open-Meteo (sem chave)
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    forecast_timeout_seconds: float = 15
    forecast_cache_ttl_seconds: int = 30 * 60
    forecast_retry_seconds: int = 5 * 60  # depois de uma falha, espera isso antes de tentar de novo

    # Busca de bairros no Nominatim (OpenStreetMap): no máximo 1 pedido por segundo e User-Agent próprio
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    nominatim_user_agent: str = "WaterWaltz/0.1 (+https://github.com/A-T-L-A-S-XIII/NASA-Space-Apps-Challenge)"
    nominatim_min_interval_seconds: float = 1.0
    places_timeout_seconds: float = 15
    places_cache_ttl_seconds: int = 24 * 60 * 60

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origin_regex", mode="before")
    @classmethod
    def empty_regex(cls, value):
        return value or None


JWT_SECRET_MIN_LENGTH = 32
# Valores que já circularam no código ou na documentação; quem os conhece forja tokens
KNOWN_WEAK_SECRETS = {"troque-esta-chave", "changeme", "secret"}


class InsecureConfig(RuntimeError):
    pass


def check_jwt_secret(secret: str) -> None:
    """Recusa iniciar a API com uma chave de JWT vazia, conhecida ou curta.

    Quem sabe a chave consegue fabricar o token de qualquer usuário (inclusive governo) sem senha.
    """
    hint = 'Gere uma com: python -c "import secrets; print(secrets.token_hex(32))" e defina JWT_SECRET.'
    if not secret:
        raise InsecureConfig("JWT_SECRET não definida. " + hint)
    if secret in KNOWN_WEAK_SECRETS:
        raise InsecureConfig("JWT_SECRET está com um valor de exemplo público. " + hint)
    if len(secret) < JWT_SECRET_MIN_LENGTH:
        raise InsecureConfig(f"JWT_SECRET precisa de pelo menos {JWT_SECRET_MIN_LENGTH} caracteres. " + hint)


settings = Settings()
