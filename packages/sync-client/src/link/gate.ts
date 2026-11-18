// Whether this build may work with the server that answered WELCOME.
import { VERSION_FIELDS } from "@manent/sync-protocol";
import type { ServerVersions, VersionSet } from "@manent/sync-protocol";

/** `limited`: the server does not know this build's newest schema. */
export type ServerGate = "ok" | "limited" | "too_old";

/**
 * `too_old` when any of the server's current versions is below `minServer`, the
 * lowest this build works with; `limited` when this build writes a schema newer
 * than the server's; `ok` otherwise.
 */
export function gateServer(
  client: VersionSet,
  minServer: VersionSet,
  server: ServerVersions,
): ServerGate {
  if (VERSION_FIELDS.some((field) => server.current[field] < minServer[field]))
    return "too_old";
  return client.schema > server.current.schema ? "limited" : "ok";
}
