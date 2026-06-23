---
name: auth
description: Set up or debug social auth flows (Google, Apple, email) using Supabase auth
argument-hint: '<google|apple|email|all>'
---

Wire up authentication for `$ARGUMENTS` using Supabase auth.

> If the project uses a custom auth library, check `CLAUDE.md` for the package names before writing any imports.

## Package responsibilities

| Package                                     | Role                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `@supabase/supabase-js`                     | Auth client, session management, token refresh     |
| `@react-native-google-signin/google-signin` | Google Sign-In adapter                             |
| `expo-apple-authentication`                 | Apple Sign-In                                      |
| `expo-secure-store`                         | Secure session storage adapter for Supabase client |

## Required Doppler vars

- `GOOGLE_WEB_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_IOS_CLIENT_ID` — iOS-specific client ID

## Setup steps

1. **Configure Supabase client** — pass `expo-secure-store` adapter as the storage option in `createClient`

2. **Wrap root** — subscribe to `supabase.auth.onAuthStateChange` in root layout; expose session via context or Zustand

3. **Google** — call `GoogleSignin.configure({ webClientId, iosClientId })` on app start; pass the id token to `supabase.auth.signInWithIdToken`

4. **Apple** — use `expo-apple-authentication`; pass the identity token to `supabase.auth.signInWithIdToken`

5. **Access auth state** — always via your auth context or store — never read tokens directly from storage

6. **Protected routes** — check `isAuthenticated` in the root layout and redirect to `/login` via `expo-router`

## Rules

- Sessions stored via `expo-secure-store` adapter — never raw MMKV or AsyncStorage
- Never expose tokens in logs, Sentry breadcrumbs, or network request bodies
- Token refresh is handled by the Supabase client automatically — do not implement custom refresh logic
- For sign-out: call `supabase.auth.signOut()` — do not manually clear stores or storage
