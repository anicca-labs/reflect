# Prod promotion — notifications, reminders & push re-engagement

Everything below is **live on staging** (`reflect-stg`, ref `sznlkorcninofgezkwmy`) and must be
promoted to **prod** (`orrcfftpaxlldolavipm`) once the new binary clears Apple review.

Client (React Native) changes reach devices via **OTA** — no per-item action, just
`yarn push-ota:prd` after review (see step 6). The server side (DB + edge functions +
cron + secrets) is **not** carried by OTA and must be applied to prod explicitly.

> Prereq: the prod binary in review must be built from a runtime **fingerprint** that
> matches the OTA you'll push. A native change needs a fresh full build before its OTAs
> apply — see the OTA fingerprint notes in `CLAUDE.md`.

---

## What shipped on staging

**Feature:** daily journal reminders + whole-base push re-engagement.

- Guests → **local** daily reminder (on-device, localized).
- Signed-in → **server** daily reminder via a per-minute `pg_cron` → `send-reminders` FCM push.
- Every user (incl. guests) has a captured push token so `admin-push` can reach the whole
  base for re-engagement, targeted by account type / locale / reminder-enabled / inactivity.
- Tapping any "go write" push opens the journal composer (`data.type === 'daily-reminder'`).
- Admin console: `docs/admin/push.html` (audience filters, preview, per-locale Claude
  translation, pre-translated templates).
- Biometric-lock fixes (re-prompt after background; Unlock button always available).

**DB migrations** (apply in this order):

- `20260713000000_device_tokens_nullable_user_id.sql`
- `20260713000100_device_tokens_engagement_columns.sql` (`reminder_enabled`, `last_active_at`)
- `20260713000200_device_tokens_locale.sql`
- `20260713000400_device_tokens_rls_claim.sql` (per-command RLS; lets a signed-in user reclaim a guest row)

**Edge functions** (new/changed):

- `register-device-token` (NEW, `--no-verify-jwt`) — guest token registration
- `send-reminders` (NEW, JWT-verified) — per-minute cron target
- `admin-push` (changed) — filters, preview, templates, Claude translation, tap→composer data
- `_shared/firebase.ts` (changed) — FCM v1 send + collapse
- `_shared/notifications.ts` (NEW) — shared `REMINDER_DATA_TYPE`

**Secrets** required by the functions (per env, via Doppler `mobile/*`):

- `ANTHROPIC_API_KEY` (admin-push Claude translation)
- `REVENUECAT_WEBHOOK_TOKEN` (revenuecat-webhook — from the free-entry-limit work)
- `FIREBASE_*` service-account creds (already present for existing FCM)

**pg_cron job:** `send-reminders-every-minute` — POSTs to the `send-reminders` function
every minute with the project **anon** key.

---

## Promotion checklist (prod = `orrcfftpaxlldolavipm`)

### 1. Apply DB migrations to prod

Apply all four `20260713*` migrations above to the prod project (Supabase dashboard SQL,
`supabase db push` against prod, or MCP `apply_migration`). Also apply the free-entry-limit
migration `20260630000000_*` if not already done (see `CLAUDE.md`).

### 2. Set prod function secrets

```
# ensure ANTHROPIC_API_KEY (+ REVENUECAT_WEBHOOK_TOKEN, FIREBASE_*) exist in Doppler mobile/prd
yarn functions:push-secrets:prd
```

`scripts/push-function-secrets.sh` pushes a **hardcoded allowlist** (`KEYS`) — confirm
`ANTHROPIC_API_KEY` is in it (it is) before running.

### 3. Deploy edge functions to prod

```
yarn functions:deploy:prd
```

Deploys all functions, then re-deploys the `--no-verify-jwt` ones (admin-push,
register-device-token, expo-update-manifest, revenuecat-webhook). `send-reminders` stays
JWT-verified (the cron passes the anon key).

### 4. Create the prod pg_cron job

Mirror staging with the **prod** URL + **prod anon key** (Settings → API → anon/public):

```sql
select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://orrcfftpaxlldolavipm.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <PROD_ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Requires `pg_cron` + `pg_net` extensions enabled on prod (enable if missing).

### 5. RevenueCat prod webhook (free-entry-limit dependency)

Per `CLAUDE.md`: set a fresh `REVENUECAT_WEBHOOK_TOKEN` in Doppler `mobile/prd`, create the
webhook on the **prod** RC project pointing at the prod function URL with that token, and
**backfill** existing Pro subscribers (RC REST `GET /v1/subscribers/{id}` or event re-send)
so they aren't treated as free until their next RC event.

### 6. OTA the client to prod (AFTER Apple approval)

```
yarn push-ota:prd
```

Must run under the **same Doppler env as the prod build** (config-affecting vars change the
fingerprint). Verify reachability via `api.ota_request_log` on prod after a device relaunch.

### 7. Merge `stg` → `main`

`stg` is ~45 commits ahead. Merge (no squash — repo disallows it) so `main` matches, which
also publishes the admin console at `docs/admin/push.html` via Pages.

---

## Post-deploy verification (prod)

- `select count(*) from api.device_tokens;` grows as prod devices register.
- Set a reminder as a **signed-in** prod user for +2 min → confirm the FCM push arrives and
  tapping it opens the composer.
- `select * from cron.job_run_details order by start_time desc limit 5;` → the minute job
  is running without errors.
- Send one admin push from the console (prod env) to yourself → confirm delivery + tap→composer.

## Optional hardening

- **`send-reminders` auth:** it's JWT-verified, but the anon key is public (shipped in the
  app), so anyone could POST to trigger a send. Blast radius is small (only users whose
  reminder minute == now; deliveries are collapse-deduped). To tighten, gate on a dedicated
  secret header compared inside the function instead of relying on the anon JWT.
