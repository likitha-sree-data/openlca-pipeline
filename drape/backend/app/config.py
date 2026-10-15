"""Settings read from the environment. Secrets never leave the server."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/drape"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"

    # Drape-issued sessions (demo and dev sign-in) and signed local URLs
    app_secret: str = "dev-only-change-me-0123456789abcdef"
    auth_dev_login: bool = False
    admin_emails: str = ""

    storage_driver: str = "local"  # local or supabase
    local_storage_dir: str = str(ROOT / ".data" / "storage")
    signed_url_ttl: int = 3600
    storage_quota_mb: int = 300
    upload_max_mb: int = 12
    upload_max_pixels: int = 40_000_000

    llm_provider: str = "none"  # anthropic, gemini or none
    llm_model: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    chat_daily_cap: int = 50
    chat_per_minute: int = 10

    resend_api_key: str = ""
    email_from: str = "Drape <reminders@example.com>"
    public_base_url: str = "http://localhost:7860"

    study_mode: bool = False
    demo_mode: bool = False
    feature_color_profile: bool = False
    internal_cron_secret: str = ""

    # Models. Each one is optional; a fallback is used when it is missing.
    enable_rembg: bool = True
    enable_fashion_clip: bool = True
    enable_segformer: bool = True
    fashion_clip_model: str = "patrickjohncyh/fashion-clip"
    segformer_model: str = "mattmdjaga/segformer_b2_clothes"

    static_dir: str = str(ROOT / "frontend" / "dist")
    log_level: str = "INFO"

    rate_limits: dict[str, tuple[int, int]] = Field(
        default_factory=lambda: {
            # name: (requests, per seconds)
            "upload": (60, 60),
            "scan": (60, 60),
            "fetch": (20, 60),
            "chat": (10, 60),
            "auth": (20, 60),
            "export": (5, 3600),
        }
    )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
