export interface TokenBucket {
  /**
   * Takes `cost` tokens, refilled from `now()` since the last call. A refusal
   * takes nothing and says how long until the tokens would be there.
   */
  take(cost: number): { ok: true } | { ok: false; retryAfterMs: number };
}

/**
 * A bucket that starts full, refills `perSecond` tokens a second and holds at
 * most `burst`. A cost above the burst can never be taken and is refused with
 * the time a full bucket takes. A clock that goes backwards refills nothing,
 * and refilling goes on from its new reading.
 */
export function createTokenBucket(options: {
  perSecond: number;
  burst: number;
  now: () => number;
}): TokenBucket {
  const { perSecond, burst, now } = options;
  let level = burst;
  let refilledAt = now();
  const waitMs = (tokens: number): number =>
    Math.ceil((tokens * 1000) / perSecond);
  return {
    take(cost) {
      const at = now();
      const elapsedMs = Math.max(0, at - refilledAt);
      level = Math.min(burst, level + (elapsedMs * perSecond) / 1000);
      refilledAt = at;
      if (cost > burst) return { ok: false, retryAfterMs: waitMs(burst) };
      if (cost > level)
        return { ok: false, retryAfterMs: waitMs(cost - level) };
      level -= cost;
      return { ok: true };
    },
  };
}
