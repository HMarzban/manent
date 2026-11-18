// Builds the app shell with Bun.build, turns its outputs into precache entries and bundles the
// chosen service worker with those entries and the build ID compiled in.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const ROOT = import.meta.dir;
const WORKERS = { serwist: "sw/serwist-sw.ts", hand: "sw/hand-sw.ts" } as const;
// Bun's default asset and chunk names carry an 8-character content hash, so the URL is the revision.
const HASHED = /-[a-z0-9]{8}\./;

interface Entry {
  url: string;
  revision: string | null;
}

function isWorker(value: string | undefined): value is keyof typeof WORKERS {
  return value === "serwist" || value === "hand";
}

async function buildApp(out: string, buildId: string): Promise<Entry[]> {
  const result = await Bun.build({
    entrypoints: [join(ROOT, "app/index.html")],
    outdir: out,
    publicPath: "/",
    define: { BUILD_ID: JSON.stringify(buildId) },
  });
  if (!result.success) throw new AggregateError(result.logs, "the app shell did not build");
  return result.outputs.map((output) => {
    const url = `/${relative(out, output.path)}`;
    const hashed = url !== "/index.html" && HASHED.test(basename(url));
    return { url, revision: hashed ? null : output.hash };
  });
}

async function buildWorker(out: string, sw: keyof typeof WORKERS, entries: Entry[], buildId: string): Promise<Uint8Array> {
  const result = await Bun.build({
    entrypoints: [join(ROOT, WORKERS[sw])],
    outdir: out,
    naming: "sw.js",
    target: "browser",
    define: {
      "self.__SW_MANIFEST": JSON.stringify(entries),
      "self.__BUILD_ID": JSON.stringify(buildId),
    },
  });
  if (!result.success) throw new AggregateError(result.logs, `the ${sw} worker did not build`);
  return Bun.file(join(out, "sw.js")).bytes();
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { sw: { type: "string" }, "build-id": { type: "string" }, out: { type: "string" } },
  });
  const sw = values.sw;
  const buildId = values["build-id"];
  if (!isWorker(sw) || buildId === undefined || values.out === undefined) {
    console.error("Usage: bun build.ts --sw <serwist|hand> --build-id <id> --out <dir>.");
    process.exit(2);
  }
  const out = resolve(ROOT, values.out);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const entries = await buildApp(out, buildId);
  const worker = await buildWorker(out, sw, entries, buildId);
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`${sw} worker: ${worker.byteLength} bytes, ${Bun.gzipSync(worker).byteLength} bytes gzip`);
}
