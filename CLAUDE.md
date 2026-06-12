# reflect

## Project context

- api: `https://api.your-domain.com`
- Supabase: `reflect-dev` (dev) · ref: `sznlkorcninofgezkwmy` · prd ref: `orrcfftpaxlldolavipm`
- DB schema: `api` (not `public`)
- OTA: self-hosted via Supabase — `yarn push-ota` (stg) / `yarn push-ota:prd` (prd)
  - Doppler vars required per env: `EXPO_UPDATE_URL` (Edge Function URL), `EXPO_UPDATE_CHANNEL` (`stg`/`prd`)
  - `EXPO_UPDATE_URL` = `https://{supabase-ref}.supabase.co/functions/v1/expo-update-manifest`
  - Deploy edge functions: `yarn functions:deploy:stg` / `yarn functions:deploy:prd`
