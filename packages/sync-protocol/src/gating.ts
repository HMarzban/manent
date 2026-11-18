// Version gating: whether a client may connect at all, and whether it may edit a document.
import { CODE } from "./constants.ts";
import { VERSION_FIELDS } from "./messages.ts";
import type { ServerVersions, VersionField, VersionSet } from "./messages.ts";

export type ConnectionGate =
  | { ok: true; clientNewer: boolean }
  | { ok: false; code: typeof CODE.TOO_OLD; field: VersionField };

/**
 * At HELLO: a client below any of the server's minimums is refused with 4408, naming the first
 * field that fails. `clientNewer` is true when any client field is above the server's current one.
 */
export function gateConnection(
  client: VersionSet,
  server: ServerVersions,
): ConnectionGate {
  for (const field of VERSION_FIELDS)
    if (client[field] < server.min[field])
      return { ok: false, code: CODE.TOO_OLD, field };
  return {
    ok: true,
    clientNewer: VERSION_FIELDS.some(
      (field) => client[field] > server.current[field],
    ),
  };
}

/** At SUBSCRIBE: a client older than the document's schema or engine may only read it. */
export function gateDocument(
  client: VersionSet,
  doc: { minSchema: number; engineVersion: number },
): "edit" | "read_only" {
  return client.schema < doc.minSchema || client.engine < doc.engineVersion
    ? "read_only"
    : "edit";
}
