import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL
const apiKey = process.env.EXPO_PUBLIC_SUPABASE_API_KEY
if (!serverUrl || !apiKey) throw new Error('Missing required Supabase env vars')

const supabase = createClient(
  serverUrl,
  apiKey,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    db: { schema: 'api' },
  },
);

export { supabase }
