from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Taskboard API"
    database_url: str = "sqlite:///./taskboard.db"
    # No default on purpose: a missing key stops the app instead of signing
    # tokens with a value anyone could read in the source.
    secret_key: str
    access_token_expire_minutes: int = 30

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
