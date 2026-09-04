const IS_TEST = process.env.NODE_ENV === 'test';

/** Route-level rate limit config, effectively disabled under the test suite so fast iteration isn't throttled. */
export function authRateLimit(max: number, timeWindow: string): { max: number; timeWindow: string } {
  return { max: IS_TEST ? 100_000 : max, timeWindow };
}
