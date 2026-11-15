from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from pydantic import field_validator
from typing import Annotated
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Water Waltz API"
    database_url: str = "sqlite:///./water_waltz.db"

    # Origens liberadas no CORS, separadas por vírgula no .env
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # Regex opcional, ex.: https://water-waltz.*\.vercel\.app (libera os previews da Vercel)
    cors_origin_regex: str | None = None

    jwt_secret: str = "troque-esta-chave"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Conta governo criada no startup se ainda não existir
    seed_gov_name: str = "Governo RS"
    seed_gov_email: str = "governo@waterwaltz.dev"
    seed_gov_password: str = "troque-esta-senha"

    # Conta de demonstração (cidadão) criada no startup se ainda não existir; é a única usada pelo frontend
    demo_user_name: str = "Conta de demonstração"
    demo_user_email: str = "demo@waterwaltz.dev"
    demo_user_password: str = "troque-esta-senha"
    demo_user_city: str = "Lajeado"  # uma das cidades de app/data/regions.py

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


settings = Settings()
