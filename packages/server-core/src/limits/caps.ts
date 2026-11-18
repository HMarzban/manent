export interface ConnectionCaps {
  /** Counts the connection and answers true, or counts nothing and answers false. */
  admit(who: { userId: string; address: string }): boolean;
  /** Uncounts a connection that `admit` let in. */
  release(who: { userId: string; address: string }): void;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Keys at zero are removed, so the maps hold only open connections. */
function decrement(counts: Map<string, number>, key: string): void {
  const count = counts.get(key) ?? 0;
  if (count <= 1) counts.delete(key);
  else counts.set(key, count - 1);
}

/** Open connections, capped per user and per network address. */
export function createConnectionCaps(limits: {
  connectionsPerUser: number;
  connectionsPerAddress: number;
}): ConnectionCaps {
  const byUser = new Map<string, number>();
  const byAddress = new Map<string, number>();
  return {
    admit({ userId, address }) {
      if ((byUser.get(userId) ?? 0) >= limits.connectionsPerUser) return false;
      if ((byAddress.get(address) ?? 0) >= limits.connectionsPerAddress)
        return false;
      increment(byUser, userId);
      increment(byAddress, address);
      return true;
    },
    release({ userId, address }) {
      decrement(byUser, userId);
      decrement(byAddress, address);
    },
  };
}
