# reflect

## Never do

- `any`, `as` casts, `eslint-disable` — fix at source
- Raw hex/rgba in Tamagui props — use `$token` references only
- `StyleSheet.create()` or inline `style={{}}` — use Tamagui props for Tamagui components; wrap non-Tamagui components with `styled()` instead
- `FlatList` — use `FlashList` with `estimatedItemSize`
- `TouchableOpacity` / `Pressable` — use your team's touchable wrapper
- Raw `expo-image` — use your team's image wrapper (if any)
- `KeyboardAvoidingView` — use `react-native-keyboard-controller`
- `Alert.alert` for non-destructive feedback — use `burnt.toast()`
- `npm` / `npx` / `pnpm` — always `yarn`
- Edit files in `src/api/generated/` — run `yarn generate:open-api-hooks`
- Store auth tokens in MMKV or AsyncStorage — use `expo-secure-store`
- Handle raw card data — use Stripe `PaymentSheet` only
- Log PII in Sentry tags or breadcrumbs
- Log PII or payment data in analytics events — use opaque internal IDs only

## Database migrations

- Every `CREATE TABLE` migration must include explicit GRANTs (`anon`, `authenticated`, `service_role`) and `enable row level security` — Supabase drops auto-grants for new tables from 2026-05-30 (new projects) / 2026-10-30 (existing projects). The `database-specialist` agent and `generate_migration` tool add this boilerplate automatically.

## Always do

- Run `tsc --noEmit` after every change — zero errors before done
- Run `yarn doctor` before store builds — catches duplicate native modules before wasting EAS build time
- Wrap user-visible strings: `<Trans>` in JSX, `` t`…` `` for props (import from `@lingui/react/macro`)
- Keep files under 500 lines
- One `import` statement per module path

## Stack quick-ref

Run `/expo-rn-plugin:coding-standards` to load full standards. Quick pointers:

- **State:** server state → react-query hooks; UI state → Zustand + MMKV
- **Forms:** RHF + zod + Tamagui fields — `/expo-rn-plugin:form`
- **Auth:** Supabase auth + Google/Apple — `/auth`
- **Payments:** Stripe `PaymentSheet` — `/expo-rn-plugin:stripe`
- **Errors:** Sentry — `/expo-rn-plugin:sentry`
- **API hooks:** orval-generated hooks in `src/api/generated/`
- **Env vars:** Doppler
- **Design:** Figma tokens in `src/theme/` — `/expo-rn-plugin:figma`
- **Scaffold:** CRUD from DB table — `/expo-rn-plugin:scaffold`
- **Push notifications:** FCM + expo-notifications
- **Tests:** jest-expo + React Testing Library + `renderWithProviders` — `/expo-rn-plugin:testing`
- **Analytics:** Firebase Analytics (default), PostHog, Amplitude — `/expo-rn-plugin:analytics`

## Project context

- api: `https://api.your-domain.com`
- Supabase: `reflect-dev` (dev) · ref: `sznlkorcninofgezkwmy`

- DB schema: `api` (not `public`)
- Routes: `app/` via expo-router
- Components: `src/components/`
- Storage: `expo-secure-store` (tokens) · MMKV/Zustand (UI) · AsyncStorage (cache)
- OTA: self-hosted via Supabase — `yarn push-ota` (stg) / `yarn push-ota:prd` (prd)
  - Doppler vars required per env: `EXPO_UPDATE_URL` (Edge Function URL), `EXPO_UPDATE_CHANNEL` (`stg`/`prd`)
  - `EXPO_UPDATE_URL` = `https://{supabase-ref}.supabase.co/functions/v1/expo-update-manifest`
