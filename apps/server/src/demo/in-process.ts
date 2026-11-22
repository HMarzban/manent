// The live server as the demo's own people reach it from inside the process.
import type { ManentServer } from "@manent/server-core";
import { SEED_HOST, SEED_ORIGIN } from "../seed/server.ts";

/**
 * `server`, answering a request the seed's link and driver address to the seed's host as if it
 * named `host`, one of the hosts the live server serves; every other request is passed on as it is.
 */
export function inProcessServer(
  server: ManentServer,
  host: string,
): ManentServer {
  const origin = `http://${host}`;
  return {
    sync: server.sync,
    connections: server.connections,
    fetch(request, context) {
      const url = new URL(request.url);
      if (url.host !== SEED_HOST) return server.fetch(request, context);
      url.host = host;
      const rehosted = new Request(url, request);
      if (rehosted.headers.get("Origin") === SEED_ORIGIN)
        rehosted.headers.set("Origin", origin);
      return server.fetch(rehosted, context);
    },
  };
}
