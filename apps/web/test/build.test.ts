import { afterAll, expect, test } from "bun:test";
import { basename, join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { buildWeb } from "../build.ts";
import { BOOT_SCRIPT } from "../src/boot/boot-script.ts";

const trees = createTempTrees("manent-web-build-");
afterAll(() => trees.removeAll());

type Built = Awaited<ReturnType<typeof buildWeb>>;

interface Chunk {
  name: string;
  path: string;
  entry: boolean;
  entryPoint: string | null;
  /** The chunks this one imports statically, by output name. */
  imports: readonly string[];
  /** The source files in it, as the metafile names them. */
  inputs: readonly string[];
}

/** The script outputs of a build, from its metafile. */
function chunksOf(built: Built, outDir: string): Chunk[] {
  if (!built.ok) throw new TypeError(built.logs.join("\n"));
  return Object.entries(built.metafile.outputs)
    .filter(([name]) => name.endsWith(".js"))
    .map(([name, output]) => ({
      name,
      path: join(outDir, name),
      entry: output.entryPoint?.endsWith("index.html") === true,
      entryPoint: output.entryPoint ?? null,
      imports: output.imports
        .filter((i) => i.kind === "import-statement")
        .map((i) => i.path),
      inputs: Object.keys(output.inputs),
    }));
}

/** Every chunk reached by static imports from `start`. */
function staticReachOf(chunks: readonly Chunk[], start: Chunk): Chunk[] {
  const byName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const reached: Chunk[] = [];
  const seen = new Set<string>();
  const queue = [start];
  for (const chunk of queue) {
    if (seen.has(chunk.name)) continue;
    seen.add(chunk.name);
    reached.push(chunk);
    for (const next of chunk.imports) {
      const target = byName.get(next);
      if (target !== undefined) queue.push(target);
    }
  }
  return reached;
}

const productionBuild = async (): Promise<{ outDir: string; built: Built }> => {
  const outDir = await trees.tree({});
  return { outDir, built: await buildWeb({ outDir, flavour: "production" }) };
};

const entryText = async (built: Built, outDir: string): Promise<string> => {
  const entry = chunksOf(built, outDir).find((c) => c.entry);
  if (entry === undefined) throw new TypeError("no entry chunk");
  return Bun.file(entry.path).text();
};

test("the web app builds to static files with absolute asset paths", async () => {
  const { outDir, built } = await productionBuild();
  expect(built.ok).toBe(true);
  const html = await Bun.file(join(outDir, "index.html")).text();
  expect(html).toMatch(new RegExp('src="/chunk-[a-z0-9]+\\.js"'));
  expect(html).toMatch(new RegExp('href="/chunk-[a-z0-9]+\\.css"'));
}, 30_000);

test("the build puts the boot script first in the head, and splits screens into chunks", async () => {
  const { outDir, built } = await productionBuild();
  const html = await Bun.file(join(outDir, "index.html")).text();
  const head = new RegExp(
    "<head>\\s*(<script>[^<]*</script>)\\s*(<meta [^>]*>)",
  ).exec(html);
  expect([head?.[1], head?.[2]]).toEqual([
    `<script>${BOOT_SCRIPT}</script>`,
    '<meta name="color-scheme" content="light dark" />',
  ]);
  expect(
    chunksOf(built, outDir).filter((c) => c.name.startsWith("./chunk-")).length,
  ).toBeGreaterThan(1);
}, 30_000);

test("the static frame stands in the page until the app replaces it", async () => {
  const { outDir } = await productionBuild();
  const html = await Bun.file(join(outDir, "index.html")).text();
  expect(html).toMatch(
    new RegExp(
      '<div id="root">\\s*<div class="mn-static-frame">\\s*<div class="mn-static-titlebar"></div>\\s*<div class="mn-static-statusbar"></div>\\s*</div>\\s*</div>',
    ),
  );
}, 30_000);

test("the test flavour is a build of its own", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir, flavour: "test" });
  const production = await productionBuild();
  const [testEntry, productionEntry] = await Promise.all([
    entryText(built, outDir),
    entryText(production.built, production.outDir),
  ]);
  expect([testEntry === productionEntry, built.ok]).toEqual([false, true]);
}, 60_000);

test("the build writes a service worker holding the whole shell, fonts included", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir, flavour: "production" });
  if (!built.ok) throw new TypeError(built.logs.join("\n"));
  const sw = await Bun.file(join(outDir, "sw.js")).text();
  for (const file of built.files.filter(
    (f) => new RegExp("\\.(html|js|css|woff2?)$").test(f) && f !== "sw.js",
  ))
    expect(sw).toContain(JSON.stringify(`/${basename(file)}`));
  const css = built.files.filter((f) => f.endsWith(".css"));
  expect(css.length).toBe(1);
  // the build inlines the stylesheet's fonts
  expect(await Bun.file(join(outDir, css[0]!)).text()).toContain(
    "data:font/woff2",
  );
  expect(sw).not.toContain('"/api/');
  // the library stays in the worker
  for (const file of built.files.filter(
    (f) => f.endsWith(".js") && !f.endsWith("sw.js"),
  ))
    expect(await Bun.file(join(outDir, file)).text()).not.toContain("Serwist");
}, 60_000);

test("the entry and its static chunks hold none of the editor's code", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir, flavour: "test" });
  const chunks = chunksOf(built, outDir);
  const entry = chunks.find((chunk) => chunk.entry);
  if (entry === undefined) throw new TypeError("no entry chunk");
  const reached = staticReachOf(chunks, entry);
  const editorInputs = reached.flatMap((chunk) =>
    chunk.inputs.filter(
      (input) =>
        input.includes("packages/editor/") ||
        input.includes("prosemirror-state"),
    ),
  );
  const texts = await Promise.all(
    reached.map((chunk) => Bun.file(chunk.path).text()),
  );
  expect([
    editorInputs,
    texts.some((text) =>
      text.includes("Adding different instances of a keyed plugin"),
    ),
  ]).toEqual([[], false]);
}, 30_000);

test("the document screen and palette chunks hold none of the editor's code", async () => {
  const outDir = await trees.tree({});
  const built = await buildWeb({ outDir, flavour: "test" });
  const chunks = chunksOf(built, outDir);
  for (const suffix of [
    "screens/document/document-screen.tsx",
    "shell/shell-palette.tsx",
  ]) {
    const start = chunks.find((chunk) => chunk.entryPoint?.endsWith(suffix));
    if (start === undefined) throw new TypeError(`no chunk for ${suffix}`);
    const reached = staticReachOf(chunks, start);
    const editorInputs = reached.flatMap((chunk) =>
      chunk.inputs.filter(
        (input) =>
          input.includes("packages/editor/") ||
          input.includes("prosemirror-state"),
      ),
    );
    const texts = await Promise.all(
      reached.map((chunk) => Bun.file(chunk.path).text()),
    );
    expect([
      suffix,
      editorInputs,
      texts.some((text) =>
        text.includes("Adding different instances of a keyed plugin"),
      ),
    ]).toEqual([suffix, [], false]);
  }
}, 30_000);
