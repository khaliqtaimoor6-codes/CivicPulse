import random
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from time import perf_counter

from app.metrics import TRIAGE_FALLBACK_COUNT, TRIAGE_LATENCY
from app.providers.cache.redis_provider import RedisCacheProvider
from app.providers.triage.base import TriageProvider, TriageResult
from app.providers.triage.rules import RuleBasedTriage
from app.routes.meta import record_triage


class TriageService:
	def __init__(
		self,
		primary_provider: TriageProvider,
		fallback_provider: RuleBasedTriage,
		cache: RedisCacheProvider,
		timeout_seconds: float = 10.0,
	) -> None:
		self.primary_provider = primary_provider
		self.fallback_provider = fallback_provider
		self.cache = cache
		self.timeout_seconds = timeout_seconds
		self.last_latency_ms = 0
		self.last_fallback_error: Exception | None = None
		self.last_fallback_provider: str | None = None

	def triage(self, text: str, location: str) -> tuple[TriageResult, str]:
		self.last_fallback_error = None
		self.last_fallback_provider = None
		cached_result = self.cache.get_triage_result(text, location)
		if cached_result is not None:
			self.last_latency_ms = 0
			self._record_metrics(self.primary_provider.name)
			return cached_result, self.primary_provider.name

		started_at = perf_counter()
		triaged_by = "rules:fallback"
		try:
			result = self._triage_primary(text, location)
			try:
				self.cache.set_triage_result(text, location, result)
			except Exception:
				pass
			triaged_by = self.primary_provider.name
		except Exception as error:
			self.last_fallback_error = error
			self.last_fallback_provider = self.primary_provider.name
			result = self.fallback_provider.triage(text, location)
		finally:
			self.last_latency_ms = int((perf_counter() - started_at) * 1000)
			self._record_metrics(triaged_by)

		return result, triaged_by

	def _record_metrics(self, provider: str) -> None:
		TRIAGE_LATENCY.observe(self.last_latency_ms / 1000)
		if provider == "rules:fallback":
			TRIAGE_FALLBACK_COUNT.inc()
		record_triage(provider, self.last_latency_ms)

	def _triage_primary(self, text: str, location: str) -> TriageResult:
		try:
			return self._call_with_timeout(text, location)
		except Exception as error:
			if not self._is_retryable(error):
				raise
			time.sleep(random.uniform(0.1, 0.5))
			return self._call_with_timeout(text, location)

	def _call_with_timeout(self, text: str, location: str) -> TriageResult:
		executor = ThreadPoolExecutor(max_workers=1)
		future = executor.submit(self.primary_provider.triage, text, location)
		try:
			return future.result(timeout=self.timeout_seconds)
		finally:
			executor.shutdown(wait=False, cancel_futures=True)

	@staticmethod
	def _is_retryable(error: Exception) -> bool:
		if isinstance(error, TimeoutError):
			return True

		status_code = getattr(error, "status_code", None)
		if status_code is None:
			response = getattr(error, "response", None)
			status_code = getattr(response, "status_code", None)

		return status_code == 429 or (
			isinstance(status_code, int) and 500 <= status_code <= 599
		)
