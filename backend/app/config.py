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
	# `database_url` and `redis_url` are required fields, but they are supplied
	# by the environment (compose `environment:`, the k8s ConfigMap and Secret,
	# or GitHub Secrets in CI) rather than at the call site. mypy only sees the
	# constructor call and cannot know that, so the two `call-arg` errors it
	# reports here are false positives. Settings() raises ValidationError at
	# import time if either variable is genuinely absent, which is the intended
	# fail-fast behaviour -- a missing DSN should stop the process booting, not
	# surface later as a connection error on the first request.
	return Settings()  # type: ignore[call-arg]
