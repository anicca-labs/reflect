# Claude Code on the web — MCP setup

The full setup & troubleshooting guide for running this app's MCP servers in
Claude Code on the web now lives in the **plugin**, so it's shared across every app
instead of duplicated per repo:

> **`ksairi-org/claude` (`expo-rn-plugin`) → `docs/claude-code-web-setup.md`**

Only the app-specific wiring lives in this repo (required because the plugin is not
installed in web sessions):

- `mcp.config.json` — Doppler project/config + app settings
- `.mcp.json` — MCP servers (commands use `${CLAUDE_PLUGIN_ROOT:-.}/bin/mcp-run.sh`)
- `bin/mcp-run.sh` — committed launcher (doppler secret injection)
- `.claude/settings.json` — `enableAllProjectMcpServers` + marketplace/plugin entries
