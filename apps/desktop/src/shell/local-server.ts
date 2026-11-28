// Embedded demo cloud launcher and loopback HTTP helpers for the desktop shell.
import { join } from "node:path";
import { startEmbeddedCloud } from "../cloud.ts";
import type { CloudProcess } from "../cloud.ts";

/** A port nothing listens on now: listened on and closed again. */
export function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

/** The answer to a request whose handler threw: nothing of the thrown value, which may name this machine's files. */
export function onServeError(_error: unknown): Response {
  console.error("A request could not be answered.");
  return new Response("Manent could not answer that request.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** The demo cloud packed with the app, on `port`; null, and the cause logged, when it does not start. */
export async function startCloud(
  resources: string,
  root: string,
  port: number,
): Promise<CloudProcess | null> {
  try {
    return await startEmbeddedCloud({
      execPath: process.execPath,
      entry: join(resources, "cloud", "main.js"),
      dataDir: join(root, "cloud"),
      webDir: join(resources, "web"),
      seedDir: join(resources, "seed"),
      // the node was given this port's address before the cloud started, so every attempt keeps it
      freePort: () => Promise.resolve(port),
      fetch,
    });
  } catch (error) {
    // the node runs without its cloud, as it does offline
    console.error(error instanceof Error ? error.message : String(error));
    return null;
  }
}
