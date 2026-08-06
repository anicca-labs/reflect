import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
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

// Teach React Query what "focused" means here. `refetchOnWindowFocus` defaults to
// true, but React Native has no window-focus event, so without this the focus
// manager never fires and returning to the app refetches NOTHING — every query
// stays on whatever it last read until something explicitly invalidates it.
// That's how a reflection generated while the app was backgrounded stayed
// invisible on return: the server had it, the client never asked again.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => {
    // 'inactive' is deliberately IGNORED. iOS reports it for every system overlay —
    // the ATT dialog, the StoreKit paywall, Face ID, the share sheet, Control Centre —
    // and Android's share sheet flaps in and out of it mid-interaction. Treating
    // those as a focus change refetched every active query (which decrypts the whole
    // journal and every reflection) in the middle of a flow, and could land after an
    // optimistic update and roll it back: marking a reflection seen and then having
    // the banner reappear behind the open modal. Only a genuine background → active
    // transition counts as regaining focus.
    if (state === 'background') setFocused(false);
    else if (state === 'active') setFocused(true);
  });
  return () => sub.remove();
});

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
