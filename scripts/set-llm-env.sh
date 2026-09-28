#!/usr/bin/env bash
# Store a hosted LLM provider config in .env without the key ever appearing in
# a command line, a shell history file, or a chat transcript.
#
#   ./scripts/set-llm-env.sh
#   ./scripts/set-llm-env.sh --clear
#
# Writes these into .env (which .gitignore already excludes):
#
#   TRIAGE_PROVIDER=llm
#   LLM_API_KEY=<typed at the hidden prompt>
#   LLM_BASE_URL=https://openrouter.ai/api/v1
#   LLM_MODEL=<model id you pass, or chosen interactively>
#
# --clear removes those four lines again, so you can revoke the key and fall
# back to the offline providers without hand-editing the file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
VARS=(TRIAGE_PROVIDER LLM_API_KEY LLM_BASE_URL LLM_MODEL LLM_JSON_MODE)

# Strip any managed keys, keeping every unrelated line in .env untouched.
strip_vars() {
	local file="$1" line
	[ -f "$file" ] || return 0
	local tmp
	tmp="$(mktemp)"
	while IFS= read -r line || [ -n "$line" ]; do
		local skip=0 var
		for var in "${VARS[@]}"; do
			case "$line" in "$var="*) skip=1 ;; esac
		done
		case "$line" in
		"# Added by scripts/set-llm-env.sh"*) skip=1 ;;
		esac
		[ "$skip" -eq 0 ] && printf '%s\n' "$line" >>"$tmp"
	done <"$file"
	mv "$tmp" "$file"
}

if [ "${1:-}" = "--clear" ]; then
	strip_vars "$ENV_FILE"
	# If stripping left the file blank, remove it rather than leave an empty
	# .env behind that silently says "I exist".
	if [ -f "$ENV_FILE" ] && ! grep -q . "$ENV_FILE"; then
		rm -f "$ENV_FILE"
	fi
	echo "Removed LLM settings from .env"
	echo "Restart the stack to fall back: docker compose up -d"
	exit 0
fi

BASE_URL="${LLM_BASE_URL:-https://openrouter.ai/api/v1}"
MODEL="${1:-}"

if [ -z "$MODEL" ]; then
	cat <<'MSG'
Model id for the free endpoint.

Browse https://openrouter.ai/models and pick one whose id ends in :free.
Free catalogues churn, so an id that worked last week can 404 today.
Examples of the shape:  meta-llama/llama-3.3-70b-instruct:free

Paste the model id:
MSG
	read -r MODEL
fi

if [ -z "$MODEL" ]; then
	echo "No model id given; nothing written." >&2
	exit 1
fi

read -rsp 'Enter the API key (input is hidden): ' KEY
echo

if [ -z "$KEY" ]; then
	echo "No key given; nothing written." >&2
	exit 1
fi

# Sanity-check before writing: real keys are ~55 chars, so a short paste is
# almost certainly a truncated key that would 401 confusingly later.
if [ "${#KEY}" -lt 20 ]; then
	echo "That key looks too short (${#KEY} chars) -- nothing written." >&2
	exit 1
fi

# Extracted a key-shaped secret into a file-mode-600 .env below; keep it out of
# the shell history by never passing it as an argument to any command.

strip_vars "$ENV_FILE"
{
	printf '\n# Added by scripts/set-llm-env.sh -- local only, .env is gitignored\n'
	printf 'TRIAGE_PROVIDER=llm\n'
	printf 'LLM_API_KEY=%s\n' "$KEY"
	printf 'LLM_BASE_URL=%s\n' "$BASE_URL"
	printf 'LLM_MODEL=%s\n' "$MODEL"
	printf 'LLM_JSON_MODE=true\n'
} >>"$ENV_FILE"

unset KEY API_KEY
chmod 600 "$ENV_FILE"

echo
echo "Wrote TRIAGE_PROVIDER=llm, LLM_BASE_URL=$BASE_URL, LLM_MODEL=$MODEL"
echo "Key stored in .env (mode 600). Not printed, not committed."
echo
echo "Next:  docker compose up -d --force-recreate backend"
