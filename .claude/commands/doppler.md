---
name: doppler
description: Add a new secret/env var to Doppler and sync it locally
argument-hint: '<VAR_NAME=value>'
---

To add a new secret (`$ARGUMENTS`):

1. Add to `env.template.yaml`:

   ```yaml
   VAR_NAME={{ .VAR_NAME }}
   ```

2. Set in all Doppler configs:

   ```bash
   doppler secrets set VAR_NAME="value" --project <project> --config dev
   doppler secrets set VAR_NAME="value" --project <project> --config stg
   doppler secrets set VAR_NAME="value" --project <project> --config prod
   ```

3. Sync to local `.env`:
   ```bash
   yarn sync-env-vars
   ```

Use `EXPO_PUBLIC_` prefix for vars accessed in client-side code.
