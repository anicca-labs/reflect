import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import NetInfo from '@react-native-community/netinfo';
import { createMMKV } from 'react-native-mmkv';

// Teach React Query about real connectivity. Without this it assumes "online"
// (navigator.onLine is absent in React Native), so an offline read fails and
// retries with backoff for several seconds — a long spinner with nothing to
// show. Wired to NetInfo, offline reads *pause* instead and resume on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  }),
);

// Persisted entries are only restored while younger than gcTime, so the cache
// must outlive a realistic offline gap. A week covers it.
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: CACHE_MAX_AGE,
      retry: 2,
    },
  },
});

// MMKV-backed persister. MMKV is synchronous, which is exactly what the sync
// persister needs. The journal query is dehydrated to disk so the last-synced
// entries are on screen the instant the app opens — even offline — instead of
// waiting on a network read.
const mmkv = createMMKV();
const persister = createSyncStoragePersister({
  storage: {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => mmkv.remove(key),
  },
  key: 'reflect-rq-cache',
});

export { queryClient, persister, CACHE_MAX_AGE };
