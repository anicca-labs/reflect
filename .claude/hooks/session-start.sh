#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Bootstraps the container so tests/linters/MCPs work in a fresh remote session:
#   1. Installs JS deps (Yarn 4 via Corepack)
#   2. Injects MCP auth secrets from Doppler into the session env
#      (secrets stay in Doppler — only the fetch runs here, nothing is committed)
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions. Local CLI users already
# have deps installed and get secrets from the installed plugin wrapper.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

LOG="${TMPDIR:-/tmp}/session-start.log"

# --- 1. Install dependencies (idempotent; uses cached node_modules on re-runs) ---
{
  corepack enable
  yarn install
} >"$LOG" 2>&1 || {
  echo "session-start: 'yarn install' failed — see $LOG" >&2
  tail -20 "$LOG" >&2 || true
  exit 1
}
echo "session-start: dependencies installed" >&2

# --- 2. Inject MCP auth secrets from Doppler into the session env ---
# These back the sentry/supabase/revenuecat MCP servers, which read them from
# the environment. DOPPLER_TOKEN is injected by the remote environment config.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && command -v doppler >/dev/null 2>&1; then
  for var in SENTRY_AUTH_TOKEN SENTRY_ORG SUPABASE_ACCESS_TOKEN RC_MCP_API_KEY; do
    val=$(doppler secrets get "$var" --plain --project mobile --config stg 2>/dev/null || true)
    if [ -n "$val" ]; then
      echo "export ${var}=${val}" >>"$CLAUDE_ENV_FILE"
    fi
  done
  echo "session-start: MCP secrets injected into session env" >&2
fi
