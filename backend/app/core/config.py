"""Application settings, loaded from environment variables (and a .env file in development)."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    # Later files in env_file win, so backend/.env overrides the repo-level .env
    model_config = SettingsConfigDict(
        env_file=(str(REPO_DIR / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "FlowSense"
    environment: str = "development"  # development | test | production
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://flowsense:flowsense@localhost:5432/flowsense"

    # No default on purpose: the app refuses to start without a real secret.
    secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Comma-separated list of allowed browser origins
    cors_origins: str = "http://localhost:5173"

    model_dir: Path = BACKEND_DIR / "app" / "ml" / "artifacts"
    dataset_path: Path = REPO_DIR / "datasets" / "traffic_synthetic.csv"

    # Signal limits (seconds)
    signal_min_green_s: float = 10.0
    signal_max_green_s: float = 60.0
    signal_cycle_s: float = 90.0
    signal_lost_time_s: float = 8.0  # yellow + all-red, whole cycle

    # Simulation defaults
    sim_tick_interval_s: float = 2.0  # real seconds between ticks
    sim_minutes_per_tick: float = 5.0  # simulated minutes per tick
    sim_record_every_ticks: int = 3  # -> one DB record per 15 simulated minutes
    traffic_retention_days: int = 30

    prediction_horizon_minutes: int = 30

    @field_validator("secret_key")
    @classmethod
    def _secret_long_enough(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
