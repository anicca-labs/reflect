import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;
const apiKey = process.env.EXPO_PUBLIC_SUPABASE_API_KEY;
if (!serverUrl || !apiKey) throw new Error('Missing required Supabase env vars');

// iOS intermittently kills a reused keep-alive socket, surfacing as
// NSURLErrorNetworkConnectionLost (-1005) "The network connection was lost".
// It hits hardest on the first request after a fresh install (e.g. App Review),
// so retry transient network failures transparently before surfacing them.
const TRANSIENT_NETWORK_ERRORS = [
  'network connection was lost',
  'network request failed',
  'the request timed out',
  'connection appears to be offline',
];

const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastError = err;
      const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!TRANSIENT_NETWORK_ERRORS.some((m) => message.includes(m))) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
};

const supabase = createClient(serverUrl, apiKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  db: { schema: 'api' },
  global: { fetch: fetchWithRetry },
});

export { supabase };
