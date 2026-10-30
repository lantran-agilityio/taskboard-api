from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Taskboard API"
    database_url: str = "sqlite:///./taskboard.db"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
