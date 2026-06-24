#!/usr/bin/env bash
# Self-contained MCP launcher.
#
# Injects this repo's Doppler secrets into the environment, then execs the MCP
# server passed as arguments. It mirrors the plugin's own bin/mcp-run.sh so that
# the project .mcp.json servers also work in contexts where the plugin is NOT
# installed (e.g. Claude Code on the web, where SKIP_PLUGIN_MARKETPLACE=true).
#
# .mcp.json points at this via "${CLAUDE_PLUGIN_ROOT:-.}/bin/mcp-run.sh":
#   - locally the plugin sets CLAUDE_PLUGIN_ROOT, so the plugin's launcher is used
#     (this file is never reached) and nothing changes.
#   - on the web CLAUDE_PLUGIN_ROOT is unset, so this committed script runs.
#
# Secrets must be referenced by the inner server command via SHELL expansion
# ($VAR), not Claude Code's ${VAR}, because doppler injects them into the env of
# the process THIS script execs — after Claude Code has already built the argv.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CFG="$ROOT/mcp.config.json"

PROJECT="mobile"
CONFIG="stg"
if [ -f "$CFG" ] && command -v node >/dev/null 2>&1; then
  PROJECT="$(node -e 'try{const c=require(process.argv[1]);process.stdout.write((c.doppler&&c.doppler.project)||"mobile")}catch(e){process.stdout.write("mobile")}' "$CFG")"
  CONFIG="$(node -e 'try{const c=require(process.argv[1]);process.stdout.write((c.doppler&&c.doppler.config)||"stg")}catch(e){process.stdout.write("stg")}' "$CFG")"
fi

# Allow per-server overrides (e.g. a server that must run against prd).
PROJECT="${MCP_DOPPLER_PROJECT:-$PROJECT}"
CONFIG="${MCP_DOPPLER_CONFIG:-$CONFIG}"

if command -v doppler >/dev/null 2>&1 && [ -n "${DOPPLER_TOKEN:-}" ]; then
  exec doppler run -p "$PROJECT" -c "$CONFIG" -- "$@"
fi

# No doppler available: assume secrets are already in the environment.
exec "$@"
