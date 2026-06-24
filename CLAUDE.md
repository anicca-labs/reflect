# reflect

## Project context

- api: `https://api.your-domain.com`
- Supabase: `reflect-stg` (staging) · ref: `sznlkorcninofgezkwmy` · prd ref: `orrcfftpaxlldolavipm`
- DB schema: `api` (not `public`)
- OTA: self-hosted via Supabase — `yarn push-ota` (stg) / `yarn push-ota:prd` (prd)
  - Doppler vars required per env: `EXPO_UPDATE_URL` (Edge Function URL), `EXPO_UPDATE_CHANNEL` (`stg`/`prd`)
  - `EXPO_UPDATE_URL` = `https://{supabase-ref}.supabase.co/functions/v1/expo-update-manifest`
  - Deploy edge functions: `yarn functions:deploy:stg` / `yarn functions:deploy:prd`
  - `runtimeVersion` uses `policy: 'fingerprint'` (app.config.ts). `push-ota-update.mjs` computes the per-platform fingerprint via `expo-updates fingerprint:generate` — it must run under the **same Doppler env as the build** (config-affecting env vars like `EXPO_UPDATE_URL` change the fingerprint). An OTA only reaches binaries whose native fingerprint matches, so a native change needs a new full build before its OTAs apply.
