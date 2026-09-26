from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	database_url: str
	redis_url: str
	triage_provider: str = "simulated"
	rate_limit_per_minute: int = 30
	llm_api_key: str | None = None
	ollama_base_url: str = "http://ollama:11434"
	ollama_model: str = "llama3.2:1b"
	cors_origin: str = "http://localhost:5173"

	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf-8",
	)


@lru_cache
def get_settings() -> Settings:
	return Settings()
