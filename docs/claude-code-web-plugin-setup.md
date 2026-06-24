# Using the `expo-rn-plugin` in Claude Code on the web

How to get the custom plugin (`expo-rn-plugin@ksairi-org`) and its MCP servers
working in a Claude Code **web/cloud** session for this repo — the same setup you
have locally, usable from a phone or laptop browser.

Local Claude Code reads your machine's `~/.claude.json` and a globally installed
`doppler`. The web/cloud container has **none of that** — it starts fresh every
session. So everything the plugin needs must come from either (a) committed repo
config, or (b) the **environment settings** in the web UI. This doc covers both.

---

## TL;DR checklist

1. **Repo config** — already committed (see Part 1). Nothing to do.
2. **Environment settings** (web UI → cloud icon → gear) — set three fields:
   - **Setup script** → installs `doppler` (use the `--no-package-manager` form).
   - **Environment variables** → `DOPPLER_TOKEN` (service token, project `mobile`, config `stg`).
   - **Network access (Custom)** → allow the Doppler + Supabase hosts.
3. **Save**, then start a **brand-new** session **in that same environment**.
4. **Verify** (Part 3).

If something doesn't work, go straight to **Troubleshooting** (Part 4) — it lists
every wall we actually hit and the fix for each.

---

## Part 1 — Repo config (already done)

`.claude/settings.json` (committed) declares the marketplace and enables the plugin:

```json
"extraKnownMarketplaces": {
  "ksairi-org": {"source": {"source": "github", "repo": "ksairi-org/claude"}}
},
"enabledPlugins": {"expo-rn-plugin@ksairi-org": true}
```

Notes:
- The marketplace name is **`ksairi-org`** and the plugin is **`expo-rn-plugin`**,
  so the key is `expo-rn-plugin@ksairi-org`. (An earlier `@ksairi` value was wrong
  and is why the plugin failed to load.)
- The plugin is fetched from GitHub at session start. `github.com` /
  `*.githubusercontent.com` are in the default allowlist, so the fetch works.

## Part 2 — Environment settings (web UI)

Open: **cloud icon** (top of session, shows the environment name) → hover the
environment → **gear/settings** icon.

> ⚠️ Whatever you set here applies to the environment, and only to **new** sessions
> started **in that same environment**. If you have more than one environment, make
> sure you edit the one your sessions actually launch in (see Part 4).

### a) Setup script

```bash
curl -Ls https://cli.doppler.com/install.sh | sudo sh -s -- --no-package-manager
```

- `--no-package-manager` pulls the binary from **GitHub releases** (already
  allowlisted). Without it, the installer uses the apt repo at
  `packages.doppler.com`, which is **not** allowlisted, and the install silently
  fails (script still exits 0, so you end up with no `doppler` and no error).
- Setup scripts run as **root** on Ubuntu 24.04; `sudo` is available.
- If the script exits non-zero the session **fails to start**, so keep it clean.

### b) Environment variables

```
DOPPLER_TOKEN=<Doppler service token, project "mobile", config "stg">
```

- This is what lets `doppler run` fetch `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  etc. at runtime. Without it, every plugin MCP server crashes on boot.
- Use a **read-only service token scoped to `mobile` / `stg`** (Doppler →
  project `mobile` → Access → Service Tokens). A personal token or a token scoped
  to a different config will fail.
- The plugin's launcher reads the project/config from this repo's
  `mcp.config.json` (`doppler: { project: mobile, config: stg }`), then runs
  `doppler run -p mobile -c stg -- …`.
- (Optional) the `revenuecat-prd` server forces config `prd`, so it needs a
  `mobile/prd` token. Ignore it until the `stg` servers work.

### c) Network access → Custom

Keep **"include default list"** checked, and add:

```
cli.doppler.com
api.doppler.com
api.supabase.com
*.supabase.co
```

- `cli.doppler.com` — setup-script install fetch.
- `api.doppler.com` — runtime secret fetch (`doppler run`).
- `api.supabase.com`, `*.supabase.co` — the supabase / database MCP servers.
- Add other backends as you enable them: `*.sentry.io`, `api.stripe.com`,
  `mcp.stripe.com`, `api.figma.com`, `api.revenuecat.com`, `mcp.context7.com`,
  `*.googleapis.com` (firebase).

## Part 3 — Start fresh and verify

Changes apply only to **new** sessions, so start one **in the edited environment**
(the cloud icon should show that environment's name). Then:

```bash
# 1. doppler present?
which doppler && doppler --version

# 2. secrets flow end-to-end?
doppler run -p mobile -c stg -- bash -c 'echo "URL:${SUPABASE_URL:+ok} KEY:${SUPABASE_SERVICE_ROLE_KEY:+ok}"'
```

Expected: a doppler path/version, then `URL:ok KEY:ok`. If so, the plugin's MCP
servers (database, supabase, expo, …) will boot and their tools become available.

`/plugin` and `/mcp` are **not available on web** (they're interactive-only). To
confirm the plugin loaded, instead ask the assistant in plain English:

> "List the MCP servers and tools you have, plus any expo-rn-plugin skills."

Or run a functional test once servers are up:

> "Use the database MCP server to run `select 1 as ok;`"

## Part 4 — Troubleshooting (the walls we actually hit)

**Plugin doesn't appear / skills missing.** Marketplace fetch failed. Confirm
`.claude/settings.json` has the `ksairi-org` marketplace + `@ksairi-org` key, and
that the session is on a branch that has it.

**Setup script never runs (no `doppler`, even in a fresh session).** Drop a marker
as the first line and read it in-session:
```bash
# put this as the setup script, start a NEW session, then `cat /tmp/setup-marker.log`
echo "SETUP RAN: $(date)" > /tmp/setup-marker.log
curl -Ls https://cli.doppler.com/install.sh | sudo sh -s -- --no-package-manager >> /tmp/setup-marker.log 2>&1
command -v doppler >> /tmp/setup-marker.log 2>&1 || echo "doppler NOT on PATH" >> /tmp/setup-marker.log
```
- File **missing** → the script isn't attached to the environment this session
  uses. Causes: settings **not saved**, or you're editing one environment while
  sessions launch in **another**, or you **resumed** an old session (reuses the old
  container snapshot — must be genuinely new). Reopen settings, confirm the text is
  saved, note the environment **name**, and confirm the session's cloud icon shows
  that **same name**.
- File **present but "doppler NOT on PATH"** → install failed; the lines above show
  the error (usually a blocked host → fix the allowlist, or use
  `--no-package-manager`).

**`doppler` installs but MCP servers still won't connect.** Almost always the token:
```bash
doppler run -p mobile -c stg -- echo ok
```
- `Invalid Service token` / `does not have access to config` → token isn't scoped
  to `mobile/stg`. Make one that is.
- `dial tcp … api.doppler.com` → allowlist `api.doppler.com`.

**Manual install works but the setup-script field doesn't.** The field still has
the apt-repo form (`| sudo sh`) — switch it to the `--no-package-manager` form, or
allowlist `packages.doppler.com`.

## Known issue — `SKIP_PLUGIN_MARKETPLACE=true` (the actual blocker)

Even with the environment fully set up — `doppler` installed by the setup script
and a working `DOPPLER_TOKEN` present — the plugin's MCP servers may **still** not
appear as native `mcp__*` tools. Verified in a 2026-06 web session: the container
exports `SKIP_PLUGIN_MARKETPLACE=true`, which tells Claude Code on the web to skip
installing marketplace plugins. Consequences:

- `expo-rn-plugin@ksairi-org` is never installed, so `CLAUDE_PLUGIN_ROOT` is unset.
- Every server in `.mcp.json` has command `${CLAUDE_PLUGIN_ROOT}/bin/mcp-run.sh`,
  which becomes an unresolvable path → the server can't launch. `enableAllProjectMcpServers`
  doesn't help, because the command itself is missing.

This sits **above** the repo — no `.mcp.json` or `settings.json` change overcomes it,
and it can't be fixed inside a running session (MCP/plugins load once at session
start). Check it in-session with: `env | grep SKIP_PLUGIN_MARKETPLACE`.

Workarounds:
- **Use the backends directly without the plugin.** Everything the MCP servers wrap
  is reachable via `doppler run -p mobile -c stg -- <cli>` (supabase, sentry,
  firebase, gh, …). The MCP layer is just convenience over those CLIs.
- **To get native MCP tools in web**, the platform must stop skipping the marketplace.
  Escalate to Claude Code support: "Custom plugin marketplace install is skipped on
  web (`SKIP_PLUGIN_MARKETPLACE=true`); project `.mcp.json` servers that depend on
  `${CLAUDE_PLUGIN_ROOT}` therefore never launch."

## Decoupling `.mcp.json` from the plugin (so it can load without it)

The root cause above is that every `.mcp.json` command pointed at a script *inside*
the plugin (`${CLAUDE_PLUGIN_ROOT}/bin/mcp-run.sh`). We removed that hard dependency
so the project MCP servers can load on the web with no plugin installed:

1. **Committed `bin/mcp-run.sh`** — a self-contained copy of the plugin's launcher.
   It reads `doppler.project` / `doppler.config` from `mcp.config.json` (defaults
   `mobile` / `stg`) and `exec`s `doppler run -p <project> -c <config> -- "$@"`.
2. **`.mcp.json` commands → `${CLAUDE_PLUGIN_ROOT:-.}/bin/mcp-run.sh`.** The `:-`
   fallback is a no-op locally (the plugin sets `CLAUDE_PLUGIN_ROOT`, so its own
   launcher is used, unchanged) and resolves to the committed script on the web.
3. **Secrets resolve inside the server process, not via Claude's `${VAR}`.** On the
   web the secrets only exist *inside* `doppler run`, which runs *after* Claude Code
   has already built the argv — so `${SUPABASE_ACCESS_TOKEN}` in an arg expands to
   empty. Fixes:
   - `supabase`: dropped `--access-token`; the server reads `SUPABASE_ACCESS_TOKEN`
     from the (doppler-injected) env.
   - `sentry`: runs under `bash -c` so `$SENTRY_AUTH_TOKEN` / `$SENTRY_ORG` expand
     *after* injection.
   - `stripe`: dropped `--api-key`; reads `STRIPE_SECRET_KEY` from env (still needs
     the secret added in Doppler).
   - `revenuecat` already used inner-shell `$RC_MCP_API_KEY`, so it was fine.

`expo` / `database` still point at the plugin's bundled `dist/` builds, which aren't
in the repo, so those two only work where the plugin is installed (local).

### The experiment — does web actually read project `.mcp.json`?

This is the one thing that can't be determined from inside a running session. To
settle it:

1. Start a **brand-new** web session on the branch with these changes (fresh, not a
   resume — MCP servers load only at session start).
2. Ask the assistant: *"What MCP servers and tools do you have? List any `supabase`
   / `context7` ones."*

Interpretation:
- **Native `mcp__supabase__*` / `mcp__context7__*` appear** → web *does* read repo
  `.mcp.json`; the decoupling worked and native MCP tools are available on the web.
  Verify with: *"Use the supabase MCP to run `select count(*) from api.journal_entries`."*
- **Only `github` / `Gmail` / `Google_Drive` appear** → web ignores repo `.mcp.json`
  and uses only its managed MCP config. No repo-side fix is possible; escalate
  (see the `SKIP_PLUGIN_MARKETPLACE` note above).

Even in the success case, two things still gate individual servers: the environment
**network allowlist** (each backend host — `*.sentry.io`, `api.stripe.com`,
`api.figma.com`, `*.googleapis.com`, …) and **per-server secrets** in Doppler
(`STRIPE_SECRET_KEY`, `FIGMA_API_KEY`).

## Known issue — environment settings not applying

If, after setting the Setup script / Environment variables / Network access and
starting a **fresh** session in the **matching** environment, the marker file
(`/tmp/setup-marker.log`) still doesn't appear and `DOPPLER_TOKEN` is still unset,
the environment layer isn't being applied to your sessions. There is no repo-side
or in-session workaround: the plugin's MCP servers need `DOPPLER_TOKEN` (a secret
that can only come from environment variables), and in-session installs happen
*after* the MCP servers have already tried to start.

Things to try, then escalate:
1. **Delete and recreate the environment** (don't just edit it) — a stuck/cached
   environment may never re-apply changes. Add a new environment, set the three
   fields, save, launch a session explicitly in it, re-check the marker file.
2. **Escalate to Claude Code support** with: "Custom environment setup script and
   environment variables are not applied to web sessions (setup script never runs;
   `DOPPLER_TOKEN` absent) despite a fresh session in the matching environment."

## Security notes

- Prefer **read-only** Doppler service tokens, scoped to exactly the project/config
  needed. Anyone who can edit the environment can read its env vars.
- Don't paste service-role keys or DSNs into chat — they persist in the transcript.
  If you ever do, **rotate** them afterward.
