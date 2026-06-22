#!/usr/bin/env bash
# Mirror Edge Function secrets from Doppler -> Supabase so the deployed functions'
# runtime env stays in sync with Doppler (the source of truth).
#
# Run via `doppler run` so the function secrets AND SUPABASE_ACCESS_TOKEN are in env:
#   doppler run --project mobile --config <cfg> -- bash scripts/push-function-secrets.sh <project-ref>
#
# Set DRY_RUN=1 to print which keys would be pushed and validate the private-key
# round-trip WITHOUT writing anything to Supabase.
#
# Only function-relevant keys are pushed. SUPABASE_URL / SUPABASE_ANON_KEY /
# SUPABASE_SERVICE_ROLE_KEY are auto-injected by the Supabase platform and are
# rejected by `supabase secrets set`, so they are intentionally excluded. Keys
# absent from Doppler are skipped. `supabase secrets set` upserts (it never
# deletes keys not listed), so other existing Supabase secrets are left intact.
set -euo pipefail

REF="${1:?usage: push-function-secrets.sh <supabase-project-ref>}"
DRY_RUN="${DRY_RUN:-0}"

# Derived from `Deno.env.get(...)` usage across supabase/functions/**.
KEYS=(
  ADMIN_PUSH_SECRET
  FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY
  FIREBASE_PROJECT_ID_STG FIREBASE_CLIENT_EMAIL_STG FIREBASE_PRIVATE_KEY_STG
)

tmp="$(mktemp)"; chmod 600 "$tmp"; trap 'rm -f "$tmp"' EXIT

# Build a single-line env file (real newlines -> literal \n) using Python for
# portable, correct encoding. Also verifies the private key round-trips and is a
# well-formed PEM before anything is sent.
pushed="$(KEYS="${KEYS[*]}" REF="$REF" DRY_RUN="$DRY_RUN" python3 - "$tmp" <<'PY'
import os, sys
tmp = sys.argv[1]
keys = os.environ["KEYS"].split()
lines, names = [], []
for k in keys:
    v = os.environ.get(k)
    if not v:
        continue
    enc = v.replace("\n", "\\n")            # single-line, literal \n
    if k.startswith("FIREBASE_PRIVATE_KEY"):
        dec = enc.replace("\\n", "\n")       # what the function will decode
        assert dec == v, f"{k}: round-trip mismatch"
        assert "BEGIN PRIVATE KEY" in dec and "END PRIVATE KEY" in dec, f"{k}: not a PEM"
    lines.append(f"{k}={enc}")
    names.append(k)
with open(tmp, "w") as f:
    f.write("\n".join(lines) + ("\n" if lines else ""))
print(" ".join(names))
PY
)"

if [ -z "$pushed" ]; then
  echo "push-function-secrets: no function secrets found in env — nothing to push."
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "push-function-secrets: DRY RUN — would push to $REF -> $pushed"
  echo "push-function-secrets: private-key round-trip + PEM validation passed."
  exit 0
fi

supabase secrets set --project-ref "$REF" --env-file "$tmp" >/dev/null
echo "push-function-secrets: synced to $REF -> $pushed"
