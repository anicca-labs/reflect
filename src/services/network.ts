import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

// `isInternetReachable` is `null` until NetInfo finishes its first reachability
// probe; treat unknown as online so a save is never blocked on a slow probe —
// the actual request will re-validate and queue itself if it really is offline.
const isStateOnline = (state: NetInfoState): boolean =>
  state.isConnected === true && state.isInternetReachable !== false;

const isOnline = async (): Promise<boolean> => isStateOnline(await NetInfo.fetch());

/**
 * Invoke `onOnline` each time connectivity transitions from offline → online.
 * Fires only on the transition (not on every NetInfo event) so callers can use
 * it to flush queued work exactly once per reconnect. Returns an unsubscribe fn.
 */
const subscribeToOnline = (onOnline: () => void): (() => void) => {
  let wasOnline: boolean | null = null;
  return NetInfo.addEventListener((state) => {
    const online = isStateOnline(state);
    if (online && wasOnline === false) onOnline();
    wasOnline = online;
  });
};

export { isOnline, subscribeToOnline };
