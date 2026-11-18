// What the demo's server prints when it refuses to start.
import type { BindRefusalReason } from "@manent/server-core";

/** The sentence printed when the demo refuses to listen on `host`. */
export function bindRefusal(host: string, reason: BindRefusalReason): string {
  if (reason === "private_needs_lan") {
    return `${host} is a private network address. Run make demo LAN=1 to allow it.`;
  }
  return `Demo mode has no passwords, so it only starts on this machine or a private network. Refusing ${host}.`;
}
