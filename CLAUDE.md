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

## Free-entry limit (server-enforced)

- Free users may hold ≤7 journal entries; Pro is unlimited. Enforced by the `api.enforce_free_entry_limit` BEFORE INSERT trigger on `api.journal_entries` (migration `20260630000000_*`). The client gate in JournalScreen is the UX layer; the trigger is the security backstop. Re-syncs from the offline outbox are upserts → resolve to UPDATE → not blocked. On rejection the trigger raises `free_entry_limit_reached` (the client keys off this string).
- Pro status lives in `api.entitlements` (one row/user, written ONLY by the service role). Kept current by the `revenuecat-webhook` Edge Function, which RevenueCat calls on entitlement events. Auth: RevenueCat sends a fixed `Authorization` header compared to the `REVENUECAT_WEBHOOK_TOKEN` Doppler var (per env, mirrored to Supabase via `yarn functions:push-secrets:*`). Function is deployed `--no-verify-jwt`.
- **Promote to prd:** (1) apply migration `20260630000000_*` to the prd project (`orrcfftpaxlldolavipm`); (2) set a fresh `REVENUECAT_WEBHOOK_TOKEN` in Doppler `mobile/prd` + `yarn functions:push-secrets:prd`; (3) `yarn functions:deploy:prd`; (4) create the RevenueCat webhook on the prd RC project → the prd function URL with that token. **Backfill:** the entitlements table starts empty, so existing Pro subscribers are treated as free until their next RC event — backfill them (RevenueCat REST `GET /v1/subscribers/{id}` per known Pro user, or RevenueCat's webhook event re-send) before relying on enforcement, or they'll be blocked at 7.
