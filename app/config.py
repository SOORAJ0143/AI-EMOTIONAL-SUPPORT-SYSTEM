from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "HOPEMO"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"

    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    # Keep a signed-in browser session for 30 days unless the user logs out.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30
    HF_TOKEN: Optional[str] = None

    MONGODB_URI: str
    MONGODB_DB: str = "hopemo"
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    # Keep the visible OTP sender aligned with the HOPEMO support inbox. The
    # deployed SMTP credentials must belong to this same Gmail account.
    SMTP_FROM_EMAIL: str = "hopemoai.in@gmail.com"
    SMTP_FROM_NAME: str = "HOPEMO"
    SMTP_USE_TLS: bool = True
    OTP_EXPIRE_MINUTES: int = 10
    GOOGLE_CLIENT_ID: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
