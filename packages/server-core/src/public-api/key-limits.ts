// Per-API-key token bucket rate limiter; drops buckets when a key is revoked.
import { createTokenBucket } from "../limits/bucket.ts";
import type { TokenBucket } from "../limits/bucket.ts";

/** Default public API rate limit per key: 1 request/s steady state, burst of 30. */
export const KEY_RATE_LIMIT = Object.freeze({
  perSecond: 1,
  burst: 30,
} as const);

export interface KeyLimiter {
  /** Consumes one token for keyId; returns whole-second Retry-After when exhausted. */
  take(keyId: string): { ok: true } | { ok: false; retryAfterSec: number };
  /** Removes keyId's bucket from memory (called when a key is revoked). */
  drop(keyId: string): void;
  /** Number of active key buckets held in memory. */
  size(): number;
}

export function createKeyLimiter(options: {
  readonly now: () => number;
  readonly perSecond?: number;
  readonly burst?: number;
}): KeyLimiter {
  const perSecond = options.perSecond ?? KEY_RATE_LIMIT.perSecond;
  const burst = options.burst ?? KEY_RATE_LIMIT.burst;
  const buckets = new Map<string, TokenBucket>();

  return {
    take(keyId) {
      let bucket = buckets.get(keyId);
      if (bucket === undefined) {
        bucket = createTokenBucket({ perSecond, burst, now: options.now });
        buckets.set(keyId, bucket);
      }
      const outcome = bucket.take(1);
      if (outcome.ok) return { ok: true };
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(outcome.retryAfterMs / 1000)),
      };
    },

    drop(keyId) {
      buckets.delete(keyId);
    },

    size() {
      return buckets.size;
    },
  };
}
