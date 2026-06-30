import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithRetry } from './fetchWithRetry';

// The error App Review hit: iOS NSURLErrorNetworkConnectionLost (-1005),
// which Supabase's fetch surfaces as "fetch failed: The network connection was lost".
const networkConnectionLost = () => new TypeError('fetch failed: The network connection was lost.');

const okResponse = () => new Response('{}', { status: 200 });

describe('fetchWithRetry', () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  it('recovers from a transient -1005 drop on the first attempt (the App Review scenario)', async () => {
    fetchSpy
      .mockRejectedValueOnce(networkConnectionLost()) // first request dies, like the reviewer saw
      .mockResolvedValueOnce(okResponse()); // retry succeeds

    const promise = fetchWithRetry('https://api.example.com/auth/v1/token');
    await jest.advanceTimersByTimeAsync(300); // let the backoff elapse

    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a genuine error (e.g. invalid credentials) — surfaces it immediately', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Invalid login credentials'));

    await expect(fetchWithRetry('https://api.example.com')).rejects.toThrow(
      'Invalid login credentials',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 attempts when the connection keeps dropping', async () => {
    fetchSpy
      .mockRejectedValueOnce(networkConnectionLost())
      .mockRejectedValueOnce(networkConnectionLost())
      .mockRejectedValueOnce(networkConnectionLost());

    const promise = fetchWithRetry('https://api.example.com');
    const assertion = expect(promise).rejects.toThrow('The network connection was lost');
    await jest.advanceTimersByTimeAsync(300 + 600 + 900);

    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('makes a single request when the network is healthy', async () => {
    fetchSpy.mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry('https://api.example.com');
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
