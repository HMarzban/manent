// What this build's server can do for the seed; one line per capability.
import type { SeedCapability } from "@manent/demo";
import type { ManentServer } from "@manent/server-core";
import type { LiveTarget } from "./driver.ts";
import type { SeedServer } from "./server.ts";

/**
 * Each capability and how it is known: always, or by a route that answers anything but 404 (an
 * unsigned request is answered 401 by a route that exists, and 404 by one that does not).
 */
const CAPABILITY_ROUTES: readonly (readonly [SeedCapability, string | null])[] =
  [
    ["edit", null],
    ["history", "/api/versions/name"],
    ["restore", "/api/versions/name"],
    ["device_versions", "/api/versions/upload"],
    // the live server and the seed server both run their sync service over PRODUCT_SETTING_RULES
    ["settings", null],
    ["production", "/api/production/state"],
    ["rebuild", null],
  ];

const probed = new WeakMap<ManentServer, ReadonlySet<SeedCapability>>();

async function answers(server: ManentServer, url: string): Promise<boolean> {
  const request = new Request(url, { method: "POST", body: "{}" });
  const response = await server.fetch(request, {
    remoteAddress: "127.0.0.1",
    upgrade: () => false,
  });
  return response !== null && response.status !== 404;
}

/** Asks the server at `origin` which routes it answers, once, and keeps the answer for `seedCapabilities`. */
export async function probeSeedCapabilities(
  target: { server: ManentServer },
  origin: string,
): Promise<ReadonlySet<SeedCapability>> {
  const known = probed.get(target.server);
  if (known !== undefined) return known;
  const found = new Set<SeedCapability>();
  for (const [capability, path] of CAPABILITY_ROUTES)
    if (path === null || (await answers(target.server, `${origin}${path}`)))
      found.add(capability);
  probed.set(target.server, found);
  return found;
}

/** What `probeSeedCapabilities` found for the server; a RangeError for a server it has not asked. */
export function seedCapabilities(
  target: SeedServer | LiveTarget,
): ReadonlySet<SeedCapability> {
  const known = probed.get(target.server);
  if (known === undefined)
    throw new RangeError(
      "a server's capabilities are read after probeSeedCapabilities has asked it",
    );
  return known;
}
