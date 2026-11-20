// What the local node tells a window of the upstream it relays a document through.

/** Why the server refused a document's first sync: the document then stays the device's own. */
export const HANDOFF_REFUSALS = [
  "forbidden",
  "deleted",
  "exists_elsewhere",
  "invalid",
  "too_large",
] as const;
export type HandoffRefusal = (typeof HANDOFF_REFUSALS)[number];
