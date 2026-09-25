from prometheus_client import Counter, Histogram

REQUEST_COUNT = Counter(
	"civicpulse_requests_total",
	"Total HTTP requests",
	("method", "endpoint", "status"),
)
REQUEST_LATENCY = Histogram(
	"civicpulse_request_latency_seconds",
	"HTTP request latency in seconds",
	("method", "endpoint"),
)
TRIAGE_LATENCY = Histogram(
	"civicpulse_triage_latency_seconds",
	"Triage latency in seconds",
)
TRIAGE_FALLBACK_COUNT = Counter(
	"civicpulse_triage_fallbacks_total",
	"Total triage fallbacks",
)
