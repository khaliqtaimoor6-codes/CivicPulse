from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	database_url: str
	redis_url: str
	triage_provider: str = "simulated"
	rate_limit_per_minute: int = 30
	llm_api_key: str | None = None
	# OpenAI-compatible endpoint for the hosted provider. Unset by default, which
	# keeps the Groq endpoint this project has always run against. Set it to move
	# the same client onto another host, e.g. https://openrouter.ai/api/v1.
	llm_base_url: str | None = None
	# Default is a Groq model id; an OpenAI-compatible host needs its own, e.g.
	# an OpenRouter `:free` model. Free catalogues churn, so this is settable
	# rather than baked in.
	llm_model: str = "llama-3.1-8b-instant"
	# Sends response_format={"type": "json_object"}. Needed by Groq, but some
	# OpenRouter free models 400 on it, so it can be switched off.
	llm_json_mode: bool = True
	ollama_base_url: str = "http://ollama:11434"
	ollama_model: str = "llama3.2:1b"
	cors_origin: str = "http://localhost:5173"

	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf-8",
	)

	@field_validator("llm_base_url", mode="before")
	@classmethod
	def _empty_base_url_is_unset(cls, value: str | None) -> str | None:
		# compose and the k8s ConfigMap both resolve an unset variable to an
		# empty string, which pydantic would accept as a real str. Passing
		# base_url="" to the client overrides the provider default and breaks
		# every call, so an empty value is treated as absent here instead.
		return value or None


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
