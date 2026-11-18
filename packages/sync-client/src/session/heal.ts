// The client's rule of healing: whether the server lacks what this device knows it once held.

/**
 * The client's rule of healing: the server is behind the head it once named, or
 * lacks structs it acknowledged (for an own client ID, up to `ackedClocks`) or
 * sent (for anyone else's, up to the client's own clock for that ID). Vectors
 * map a client ID to its next clock.
 */
export function needsHeal(input: {
  headSeq: number;
  lastServerSeq: number;
  own: ReadonlyMap<number, number>;
  server: ReadonlyMap<number, number>;
  ownClientIds: ReadonlySet<number>;
  ackedClocks: Readonly<Record<string, number>>;
}): boolean {
  if (input.headSeq < input.lastServerSeq) return true;
  for (const [clientId, clock] of input.own) {
    const known = input.ownClientIds.has(clientId)
      ? (input.ackedClocks[clientId] ?? 0)
      : clock;
    if ((input.server.get(clientId) ?? 0) < known) return true;
  }
  return false;
}
