// bun tools/desktop/headless.ts [--cloud <url>] [--data-dir <dir>]: the desktop's local node with no window, serving
// the web app as the desktop page. Prints one JSON line { "nodeUrl", "launchToken" } and runs until SIGTERM.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDemoDirectory, createDemoSignIn } from "@manent/demo";
import { createDesktopNode } from "@manent/local-node";
import type { NodeCore } from "@manent/local-node";
import {
  createPacketRenderPdf,
  readScriptFonts,
  serveWithBun,
} from "@manent/server-core";
import type { DesktopGlobal } from "@manent/sync-protocol";
import { VERSIONS } from "./build.ts";

/** The address `make demo` serves its cloud on. */
const DEMO_CLOUD_URL = "http://127.0.0.1:4747";

function platformOf(platform: NodeJS.Platform): DesktopGlobal["platform"] {
  if (platform === "darwin") return "mac";
  return platform === "win32" ? "windows" : "linux";
}

function onServeError(error: unknown): Response {
  console.error(error instanceof Error ? error.message : String(error));
  return new Response("", { status: 500 });
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..");
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      cloud: { type: "string" },
      "data-dir": { type: "string" },
    },
  });
  const given = values["data-dir"];
  const dataDir = resolve(
    given ?? mkdtempSync(join(tmpdir(), "manent-headless-")),
  );
  const global: DesktopGlobal = {
    v: 1,
    platform: platformOf(process.platform),
    version: "0.0.0",
    channel: "canary",
    dataDir,
  };
  const start = await createDesktopNode({
    root: dataDir,
    cloudUrl: values.cloud ?? DEMO_CLOUD_URL,
    webDir: resolve(process.env.MANENT_WEB_DIR || join(root, "apps/web/dist")),
    signIn: createDemoSignIn(),
    directory: createDemoDirectory(),
    versions: { current: VERSIONS, min: VERSIONS },
    build: "headless",
    platform: process.platform,
    renderPdf: createPacketRenderPdf(
      await readScriptFonts((key) =>
        Bun.resolveSync(
          `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
          import.meta.dir,
        ),
      ),
    ),
    boot: () => ({ global, boot: [] }),
  });
  if (!start.ok) {
    console.error(`the local node did not start: ${start.reason}`);
    process.exit(1);
  }
  const { node } = start;
  let core: NodeCore | null = null;
  const listener = serveWithBun(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      if (core === null) throw new Error("the node is used before it listens");
      return core.server;
    },
    onServeError,
  );
  const nodeUrl = `http://127.0.0.1:${listener.port}`;
  core = node.listening(nodeUrl);
  console.log(JSON.stringify({ nodeUrl, launchToken: node.launchToken }));
  process.once("SIGTERM", () => {
    void (async () => {
      await listener.stop();
      await node.close();
      // a directory made for this run holds nothing anyone asked to keep
      if (given === undefined)
        rmSync(dataDir, { recursive: true, force: true });
      process.exit(0);
    })();
  });
}
