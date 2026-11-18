// Builds one harness page for the browser and serves it on a free loopback port.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The URL of the built `<entry>.html`; `stop` closes the server and removes the build. */
export async function serveHarness(
  entry: "conformance" | "editor",
): Promise<{ url: string; stop(): Promise<void> }> {
  const outdir = await mkdtemp(join(tmpdir(), "manent-harness-"));
  const build = await Bun.build({
    entrypoints: [join(import.meta.dirname, `${entry}.html`)],
    outdir,
    target: "browser",
    publicPath: "/",
  });
  if (!build.success) {
    await rm(outdir, { recursive: true, force: true });
    throw new AggregateError(build.logs, `the ${entry} harness did not build`);
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const file = Bun.file(join(outdir, new URL(request.url).pathname));
      return (await file.exists())
        ? new Response(file)
        : new Response(null, { status: 404 });
    },
  });
  return {
    url: new URL(`${entry}.html`, server.url).href,
    async stop() {
      await server.stop(true);
      await rm(outdir, { recursive: true, force: true });
    },
  };
}
