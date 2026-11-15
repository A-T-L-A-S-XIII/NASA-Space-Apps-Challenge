from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from pydantic import field_validator
from typing import Annotated


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Water Waltz API"
    database_url: str = "sqlite:///./water_waltz.db"

    # Origens liberadas no CORS, separadas por vírgula no .env
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    jwt_secret: str = "troque-esta-chave"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Conta governo criada no startup se ainda não existir
    seed_gov_name: str = "Governo RS"
    seed_gov_email: str = "governo@waterwaltz.dev"
    seed_gov_password: str = "troque-esta-senha"

    # Catálogo público do ASF DAAC (busca não exige login Earthdata)
    asf_search_url: str = "https://api.daac.asf.alaska.edu/services/search/param"
    asf_timeout_seconds: float = 30
    asf_cache_ttl_seconds: int = 30 * 60

    # Índice ONI (El Niño / La Niña) da NOAA
    noaa_oni_url: str = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
    enso_timeout_seconds: float = 15
    enso_cache_ttl_seconds: int = 6 * 60 * 60
    enso_retry_seconds: int = 5 * 60  # depois de uma falha, espera isso antes de tentar a NOAA de novo

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
