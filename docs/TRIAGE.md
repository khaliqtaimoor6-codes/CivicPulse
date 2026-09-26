# TRIAGE

`TRIAGE_PROVIDER` selects the triage implementation. All four satisfy the same
`TriageProvider` protocol in `backend/app/providers/triage/base.py` and return
the same `TriageResult`, so they are interchangeable at the factory.

| Provider | `triaged_by` | API key | Needs network | Notes |
| --- | --- | --- | --- | --- |
| `llm` | `llm:groq` | yes (`LLM_API_KEY`) | yes | External Groq API, best quality |
| `ollama` | `llm:ollama` | no | no | Local model, fully offline |
| `rules` | `rules:*` | no | no | Deterministic keyword matching |
| `simulated` | `simulated` | no | no | Fixed canned responses |

Every provider is wrapped by `TriageService`, which enforces a 10-second
timeout per call, caches results in Redis, and degrades to `rules:fallback` on
failure. A `rules:fallback` value in the database means the selected provider
did not answer — it does not mean the provider returned a low-priority result.

## Ollama (local, key-free)

Runs a small model on the same host as the backend. Nothing leaves the
machine and no API key is required, which is what makes it the practical
alternative to `llm` for air-gapped or free-tier deployments.

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2:1b   # one-time, ~1.3 GB
TRIAGE_PROVIDER=ollama docker compose up -d backend
```

The model must be pulled before the first request. Until it is present, every
triage call fails and silently degrades to `rules:fallback`, which still looks
like a healthy service from the UI. Check with
`docker compose exec ollama ollama list`.

Override the model with `OLLAMA_MODEL`. That is the only change needed to test
a larger one.

## Measured behaviour of `llama3.2:1b`

Measured on 2026-09-26 against Ollama 0.34.4, CPU-only, on a 10-case category
set and a 9-case priority set.

| Dimension | Result |
| --- | ---: |
| Category accuracy | 9/10 (90%) |
| Priority accuracy | 3/9 (33%) |
| Priority distribution | `high` 9/9 — no other value returned |
| Accepted without fallback | 10/10 |
| Latency, mean | 2.4 s |
| Latency, max observed | 3.0 s |
| `civicpulse_triage_fallbacks_total` after 5 live complaints | 0 |

**Category classification is usable. Priority classification is not.** The
model returns `high` for every input, including a loose footpath paver. Three
prompt strategies were tried and none moved it: enum definitions, explicit
priority definitions (service cut off / degraded / cosmetic), and three
few-shot examples. All three scored 3/9 with an all-`high` distribution.

Few-shot examples also *regressed* category accuracy from 90% to 30%, because
the model began echoing the categories from the examples. The shipped prompt is
therefore the category-defining variant.

This is a capability limit of a 1B model, not a prompt problem. It is the
concrete cost of the fully-offline path, and it is the reason `llm:groq` remains
the default recommendation when quality matters.

### Known fix path

The limitation is a resolution problem, so it is fixable in two ways. A larger
model — 7B or above — has the headroom for a three-way severity judgement that
1B lacks; `OLLAMA_MODEL` makes that a one-line change with no code edit, since
the schema and prompt are model-agnostic. Failing that, a purpose-built
classifier (fine-tuned on labelled complaint/priority pairs, or a small
supervised model such as logistic regression or a gradient-boosted tree over
TF-IDF features) would almost certainly beat 1B here, because priority is a
learned mapping over keywords rather than a reasoning task. The rule-based
provider is the un-tuned version of that idea and already performs
deterministically.

Neither was evaluated here: this machine had 7.6 GiB of RAM, and loading
`llama3.2:3b` exhausted available memory and timed out. So the fix path is
identified but unproven, and the honest position is that the offline path is
currently viable for category triage and not yet for priority.

## Two implementation details that are load-bearing

**Structured output must be schema-constrained.** Ollama's `format: "json"` is
a soft hint, not a guarantee. With it, every response was rejected: the model
emitted `{"complaints": [{...}]}` rather than a flat object. Passing a real
JSON schema as `format` took acceptance from 0/6 to 10/10. Enum values are read
off the `Category` and `Priority` enums so the schema cannot drift from what is
later accepted. The strict Pydantic check still runs afterwards and stays the
authority — constrained decoding narrows the output, it does not validate it.

**`num_ctx` must be bounded.** The default 4096 made a single call take about
100 seconds on CPU by over-allocating the prefill. `num_ctx: 2048` reduced that
to roughly 2.4 seconds, which is what keeps the provider inside the 10-second
service budget. `keep_alive` holds the weights resident so an idle period does
not reintroduce the reload cost on the next request.

A larger model was not evaluated: `llama3.2:3b` could not be measured on the
7.6 GiB test machine, where loading it exhausted memory and the request timed
out. `OLLAMA_MODEL` is a single-environment-variable swap once adequate
hardware is available. See "Known fix path" above.

## Demo guidance

For a live category-plus-priority demonstration, use `rules` or `simulated`.
Both are deterministic, so a submitted complaint always produces a sensible
priority. Show `ollama` separately as the offline/no-API-key option, and state
the priority weakness when demonstrating it rather than letting it surface as a
surprise.
