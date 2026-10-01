#!/usr/bin/env bash
# Warn (never block) when bin/mcp-run.sh has drifted from the installed
# expo-rn-plugin's launcher. Only the code is compared — everything from
# `set -euo pipefail` on — since our copy carries its own header comment.
set -uo pipefail

repo=$(git rev-parse --show-toplevel)
installed="$HOME/.claude/plugins/installed_plugins.json"
[ -f "$installed" ] || exit 0

# The plugin install for this repo: project scope first, then user scope.
plugin_root=$(python3 - "$installed" "$repo" <<'PY' 2>/dev/null
import json, sys
data = json.load(open(sys.argv[1]))
installs = data.get("plugins", data).get("expo-rn-plugin@anicca-labs", [])
project = [i for i in installs if i.get("scope") == "project" and i.get("projectPath") == sys.argv[2]]
user = [i for i in installs if i.get("scope") == "user"]
for i in project + user:
    print(i["installPath"])
    break
PY
)
plugin_launcher="$plugin_root/bin/mcp-run.sh"
[ -n "$plugin_root" ] && [ -f "$plugin_launcher" ] || exit 0

body() { sed -n '/^set -euo pipefail/,$p' "$1"; }

if ! diff -q <(body "$plugin_launcher") <(body "$repo/bin/mcp-run.sh") >/dev/null; then
  echo "⚠️  bin/mcp-run.sh differs from the installed plugin's launcher:"
  echo "    $plugin_launcher"
  echo "    Sync it (keeping our header), and update .mcp.json in the same commit."
fi
exit 0
