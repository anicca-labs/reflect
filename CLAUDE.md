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

## Admin stats console

- `reflects.sytes.net/admin/stats.html` → the `admin-stats` Edge Function (prd only; same `ADMIN_PUSH_SECRET` as the push console). Aggregation lives in SQL: `api.admin_day_stats` / `admin_top_writers` / `admin_day_series`, all SECURITY DEFINER and granted to `service_role` only. Days are cut in the viewer's IANA timezone, passed from the browser.
- Guest vs signed-in activation is stamped ONCE, at activation, into `api.device_tokens.first_entry_guest` (trigger `stamp_first_entry_guest` on the null → non-null transition of `first_entry_at`). Never classify by `user_id` after the fact — it gets filled in when the owner signs in, which would silently move past guests into the signed-in bucket.

### Guest writing (estimate)

The `New guest writers` tile counts GUESTS, not entries: one per device, on the day of its first-ever entry. The server only ever learns about that first entry; entries 2..n stay on the phone. Firebase Analytics does see them — `logJournalEntryCreated` (`src/services/analytics/index.ts`) fires the `journal_entry_created` event on the guest branch too (`JournalScreen.tsx`), with a `word_count` param.

So: **guest writes for a day ≈ Firebase `journal_entry_created` count − the console's `Entries` for the same day.** A trend, not a figure — GA4 reports in the property's own timezone while the console uses the browser's, and offline saves log to Firebase at save time but reach Postgres later. The event carries no guest flag; adding one (or a server-side guest write counter) would need an app release.
