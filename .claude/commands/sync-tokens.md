---
name: sync-tokens
description: Pull the latest design tokens from Figma and regenerate src/theme/
---

Sync Figma design tokens to `src/theme/` mid-session.

## Steps

1. Check that `FIGMA_FILE_ID` and `FIGMA_API_KEY` are set:

   ```bash
   echo "FILE: $FIGMA_FILE_ID  TOKEN: ${FIGMA_API_KEY:+set}"
   ```

   If either is missing, tell the user to run `yarn sync-env-vars` first.

2. Clear the sync cache so the TTL is not a blocker:

   ```bash
   rm -f "${TMPDIR:-/tmp}/.figma-tamagui-sync-last-run"
   ```

3. Run the sync:

   ```bash
   FIGMA_TOKEN="$FIGMA_API_KEY" figma-tamagui-sync \
     --fileId="$FIGMA_FILE_ID" \
     --out="./src/theme"
   ```

4. Report which files were written. If the sync fails with a paid-plan error, tell the user — do not attempt to edit `src/theme/` manually.
