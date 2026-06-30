// iOS intermittently kills a reused keep-alive socket, surfacing as
// NSURLErrorNetworkConnectionLost (-1005) "The network connection was lost".
// It hits hardest on the first request after a fresh install (e.g. App Review),
// so retry transient network failures transparently before surfacing them.
export const TRANSIENT_NETWORK_ERRORS = [
  'network connection was lost',
  'network request failed',
  'the request timed out',
  'connection appears to be offline',
];

export const isTransientNetworkError = (err: unknown): boolean => {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_NETWORK_ERRORS.some((m) => message.includes(m));
};

export const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastError = err;
      if (!isTransientNetworkError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
};
