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
      imports: output.imports
        .filter((i) => i.kind === "import-statement")
        .map((i) => i.path),
      inputs: Object.keys(output.inputs),
    }));
}

const EDITOR_MOUNT = "src/editor-host/editor-mount.ts";
const PDF_WRITER = "packages/formats/src/pdf/write.ts";

/** The chunk holding the source file whose path ends with `suffix`; null when none does. */
const holding = (chunks: readonly Chunk[], suffix: string): Chunk | null =>
  chunks.find((c) => c.inputs.some((input) => input.endsWith(suffix))) ?? null;

/**
 * The chunk holding the source file whose path ends with `suffix`, and every chunk it imports
 * statically, the entry aside; null when no chunk holds that file.
 */
function chunksFrom(
  chunks: readonly Chunk[],
  suffix: string,
): Set<string> | null {
  const start = holding(chunks, suffix);
  if (start === null) return null;
  const byName = new Map(chunks.map((c) => [c.name, c]));
  const found = new Set<string>();
  const visit = (chunk: Chunk): void => {
    if (chunk.entry || found.has(chunk.name)) return;
    found.add(chunk.name);
    for (const name of chunk.imports) {
      const imported = byName.get(name);
      if (imported !== undefined) visit(imported);
    }
  };
  visit(start);
  return found;
}

/** The editor, which the page loads apart from the entry. */
function editorChunks(chunks: readonly Chunk[]): Set<string> {
  const found = chunksFrom(chunks, EDITOR_MOUNT);
  if (found === null) throw new TypeError("no chunk holds the editor");
  return found;
}

/** The PDF writer, which only Export loads, without the chunks it shares with the editor. */
function pdfWriterChunks(
  chunks: readonly Chunk[],
  editor: ReadonlySet<string>,
): Set<string> {
  const found = chunksFrom(chunks, PDF_WRITER);
  if (found === null) throw new TypeError("no chunk holds the PDF writer");
  return new Set([...found].filter((name) => !editor.has(name)));
}

/** Within its limit, a size equals itself capped at the limit; over it, the failure shows both. */
const withinBudget = (
  chunk: string,
  kb: number,
  limit: number,
): { chunk: string; kb: number; limit: number } => ({
  chunk,
  kb: Math.min(kb, limit),
  limit,
});

const gzipKb = async (chunk: Chunk): Promise<number> =>
  Bun.gzipSync(await Bun.file(chunk.path).bytes()).length / 1024;

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

test("bundle budget: entry ≤ 162 KB and every other chunk but the editor's and the PDF writer's ≤ 60 KB gzip", async () => {
  const { outDir, built } = await productionBuild();
  const chunks = chunksOf(built, outDir);
  const editor = editorChunks(chunks);
  const pdfWriter = pdfWriterChunks(chunks, editor);
  for (const chunk of chunks.filter(
    (c) => !editor.has(c.name) && !pdfWriter.has(c.name),
  )) {
    const kb = await gzipKb(chunk);
    const limit = chunk.entry ? 162 : 60;
    expect({ chunk: chunk.name, kb, limit }).toEqual(
      withinBudget(chunk.name, kb, limit),
    );
  }
}, 60_000);

test("first-load JavaScript is at most 362 KB gzip", async () => {
  const { outDir, built } = await productionBuild();
  const chunks = chunksOf(built, outDir);
  const entry = chunks.find((c) => c.entry);
  if (entry === undefined) throw new TypeError("no entry chunk");
  // the editor is loaded as soon as a person's services exist
  const editor = editorChunks(chunks);
  const firstLoad = chunks.filter(
    (c) => c === entry || entry.imports.includes(c.name) || editor.has(c.name),
  );
  const writer = holding(chunks, PDF_WRITER);
  if (writer === null) throw new TypeError("no chunk holds the PDF writer");
  expect(
    firstLoad.filter((c) => c.name === writer.name).map((c) => c.name),
  ).toEqual([]);
  let kb = 0;
  for (const chunk of firstLoad) kb += await gzipKb(chunk);
  expect({ chunk: "first load", kb, limit: 362 }).toEqual(
    withinBudget("first load", kb, 362),
  );
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
