// Builds the web app to static files; run directly, it builds to MANENT_WEB_DIR (apps/web/dist when unset),
// the directory the server serves, in the test flavour when MANENT_FLAVOUR=test.

import { readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { BuildMetafile } from "bun";
import tailwind from "bun-plugin-tailwind";
import { BOOT_SCRIPT, bootScriptHash } from "./src/boot/boot-script.ts";
import { buildId, precacheEntries } from "./src/sw/manifest.ts";
import type { PrecacheEntry } from "./src/sw/manifest.ts";

const REPO_ROOT = join(import.meta.dir, "../..");
const ROOT_MANIFEST = join(REPO_ROOT, "package.json");
// every manifest in the repository starts at this version
const UNVERSIONED = "0.0.0";
const DATA_WOFF2 = new RegExp("data:font/woff2;base64,([A-Za-z0-9+/=]+)", "g");
const ON_DEMAND_INPUTS = ["pdfjs-dist/", "packages/formats/"] as const;

/** Extracts base64-inlined `.woff2` fonts out of built CSS into content-hashed external files. */
async function extractCssFonts(
  outDir: string,
  cssPaths: readonly string[],
): Promise<{ path: string; bytes: Uint8Array }[]> {
  const emitted = new Map<string, { path: string; bytes: Uint8Array }>();
  for (const cssPath of cssPaths) {
    const css = await readFile(cssPath, "utf8");
    let changed = false;
    const rewritten = css.replace(DATA_WOFF2, (_match, encoded: string) => {
      changed = true;
      const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
      const hash = new Bun.CryptoHasher("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 8);
      const name = `font-${hash}.woff2`;
      if (!emitted.has(name))
        emitted.set(name, { path: join(outDir, name), bytes });
      return `/${name}`;
    });
    if (changed) await writeFile(cssPath, rewritten);
  }
  await Promise.all(
    [...emitted.values()].map(({ path, bytes }) => writeFile(path, bytes)),
  );
  return [...emitted.values()];
}

/** Root-relative URLs of heavy on-demand chunks excluded from eager first-frame SW precaching. */
function onDemandAssetUrls(
  metafile: BuildMetafile,
  inkWorkerPaths: readonly string[],
  outDir: string,
): ReadonlySet<string> {
  const outputs = Object.entries(metafile.outputs);
  const byName = new Map(outputs);
  const requiredStatic = new Set<string>();
  const queue = outputs
    .filter(
      ([name, out]) =>
        name.endsWith(".js") &&
        (out.entryPoint?.endsWith("index.html") === true ||
          out.entryPoint?.endsWith("services/person-editor.ts") === true),
    )
    .map(([name]) => name);
  for (const name of queue) {
    if (requiredStatic.has(name)) continue;
    requiredStatic.add(name);
    const out = byName.get(name);
    if (out === undefined) continue;
    for (const imp of out.imports)
      if (imp.kind === "import-statement") queue.push(imp.path);
  }
  const excluded = new Set<string>(
    inkWorkerPaths.map((p) => `/${relative(outDir, p).replaceAll("\\", "/")}`),
  );
  for (const [name, out] of outputs) {
    if (!name.endsWith(".js") || requiredStatic.has(name)) continue;
    const isHeavy =
      ON_DEMAND_INPUTS.some((marker) => out.entryPoint?.includes(marker)) ||
      Object.keys(out.inputs).some((input) =>
        ON_DEMAND_INPUTS.some((marker) => input.includes(marker)),
      );
    if (isHeavy) excluded.add(`/${name.replace(/^\.\//, "")}`);
  }
  return excluded;
}

/** The root manifest's version, or UNVERSIONED when it names none. */
async function readVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(ROOT_MANIFEST, "utf8"));
  const version =
    typeof manifest === "object" && manifest !== null
      ? Reflect.get(manifest, "version")
      : undefined;
  return typeof version === "string" ? version : UNVERSIONED;
}

/** Puts the boot script first in the page's head, so it runs before anything is drawn. */
async function insertBootScript(outDir: string): Promise<void> {
  const page = join(outDir, "index.html");
  const html = await readFile(page, "utf8");
  if (!html.includes("<head>"))
    throw new RangeError(`the built page has no <head>: ${page}`);
  await writeFile(
    page,
    html.replace("<head>", `<head><script>${BOOT_SCRIPT}</script>`),
  );
}

/** Bundles the Ink compile and live-story worker to `<outDir>/ink-compile.worker.js`. */
async function buildInkWorker(outDir: string): Promise<Bun.BuildOutput> {
  return Bun.build({
    entrypoints: [join(import.meta.dir, "src/ink/compile.worker.ts")],
    outdir: outDir,
    naming: "ink-compile.worker.js",
    format: "iife",
    minify: true,
    target: "browser",
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "self.location.href",
    },
  });
}

/** Bundles the service worker to `<outDir>/sw.js` with the precache list and its hash compiled in. */
async function buildWorker(
  outDir: string,
  entries: readonly PrecacheEntry[],
): Promise<Bun.BuildOutput> {
  return Bun.build({
    entrypoints: [join(import.meta.dir, "src/sw/worker.ts")],
    outdir: outDir,
    naming: "sw.js",
    minify: true,
    target: "browser",
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": '"production"',
      "self.__SW_MANIFEST": JSON.stringify(entries),
      "self.__BUILD_ID": JSON.stringify(buildId(entries)),
    },
  });
}

/**
 * Empties `outDir` and builds the app into it, split into chunks, with the boot script inlined,
 * then the service worker that precaches every file of the app, then the third-party notices.
 * `files` are the outputs' paths relative to `outDir`, `sw.js` last. The test flavour also serves
 * the development screens.
 */
export async function buildWeb(options: {
  outDir: string;
  flavour: "production" | "test";
}): Promise<
  | { ok: true; files: string[]; metafile: BuildMetafile }
  | { ok: false; logs: string[] }
> {
  const { outDir, flavour } = options;
  await rm(outDir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "src/index.html")],
    outdir: outDir,
    plugins: [tailwind],
    minify: true,
    target: "browser",
    sourcemap: "linked",
    publicPath: "/",
    splitting: true,
    minChunkSize: 16384,
    metafile: true,
    define: {
      "process.env.NODE_ENV": '"production"',
      MANENT_FLAVOUR: JSON.stringify(flavour),
      MANENT_VERSION: JSON.stringify(await readVersion()),
    },
  });
  if (!result.success)
    return { ok: false, logs: result.logs.map((log) => log.message) };
  if (result.metafile === undefined)
    return { ok: false, logs: ["the build wrote no metafile"] };
  await insertBootScript(outDir);
  const extractedFonts = await extractCssFonts(
    outDir,
    result.outputs
      .map((output) => output.path)
      .filter((path) => path.endsWith(".css")),
  );
  const inkWorker = await buildInkWorker(outDir);
  if (!inkWorker.success)
    return { ok: false, logs: inkWorker.logs.map((log) => log.message) };
  // read back from disk: the page and CSS have changed since the build wrote them
  const written = [
    ...(await Promise.all(
      [...result.outputs, ...inkWorker.outputs].map(async (output) => ({
        path: output.path,
        bytes: await Bun.file(output.path).bytes(),
      })),
    )),
    ...extractedFonts,
  ];
  const exclude = onDemandAssetUrls(
    result.metafile,
    inkWorker.outputs.map((output) => output.path),
    outDir,
  );
  const worker = await buildWorker(
    outDir,
    precacheEntries(written, outDir, { exclude }),
  );
  if (!worker.success)
    return { ok: false, logs: worker.logs.map((log) => log.message) };
  // a tool, so it runs as its own process: an app never imports tools
  const notices = Bun.spawnSync(
    [
      process.execPath,
      join(REPO_ROOT, "tools/notices.ts"),
      resolve(outDir, "third-party-notices.txt"),
    ],
    { cwd: REPO_ROOT },
  );
  if (notices.exitCode !== 0)
    return { ok: false, logs: [notices.stderr.toString()] };
  return {
    ok: true,
    files: [
      ...result.outputs.map((output) => output.path),
      ...extractedFonts.map((font) => font.path),
      ...inkWorker.outputs.map((output) => output.path),
      ...worker.outputs.map((output) => output.path),
    ].map((path) => relative(outDir, path)),
    metafile: result.metafile,
  };
}

if (import.meta.main) {
  const outDir = process.env.MANENT_WEB_DIR
    ? resolve(process.env.MANENT_WEB_DIR)
    : join(import.meta.dir, "dist");
  const flavour = process.env.MANENT_FLAVOUR === "test" ? "test" : "production";
  const built = await buildWeb({ outDir, flavour });
  if (!built.ok) {
    for (const log of built.logs) console.error(log);
    process.exit(1);
  }
  for (const file of built.files)
    console.log(relative(import.meta.dir, join(outDir, file)));
  console.log(`boot script: ${bootScriptHash()}`);
}
