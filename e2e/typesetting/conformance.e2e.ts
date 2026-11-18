// The engine's line starts against the lines a browser draws, over the corpus and the edge paragraphs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { offFontRanges, specKey } from "@manent/pagination";
import type { SpecKey } from "@manent/pagination";
import {
  EDGE_PARAGRAPHS,
  RULE_SCRIPTS,
  generateBlocks,
} from "@manent/pagination/testing";
import { expect, test } from "@playwright/test";
import type {
  Browser,
  BrowserContextOptions,
  JSHandle,
  Page,
  TestInfo,
} from "@playwright/test";
import type {
  Conformance,
  ConformanceItem,
  LineDifference,
} from "./harness/conformance-page.ts";
import { serveHarness } from "./harness/serve.ts";

const BLOCKING_ENGINES = ["chromium"];
const ZOOMS = [50, 100, 150, 300];
// device pixel ratios; 0.8 and 1.25 stand in for browser zoom 80 % and 125 %, which cannot be set
const SCALES = [1, 1.5, 2, 0.8, 1.25];
// 60, 35, 25 and 38 cells; capitals; a first-line indent (body is laid out in the manuscript format)
const KEYS: SpecKey[] = [
  "action",
  "dialogue",
  "parenthetical",
  "character",
  "body",
];

interface Source {
  readonly format: string;
  readonly item: ConformanceItem;
  readonly inFont: boolean;
  readonly edge: boolean;
}

// The format whose profile lays out an edge paragraph under a key.
const edgeFormat = (key: SpecKey): string =>
  key === "body" ? "manuscript" : "screenplay";

// Every non-empty block under its own key, laid out by its own format, in-font when the script font draws
// all of it; then every edge paragraph under every key.
const sources: Source[] = [
  ...[
    { format: "screenplay", blocks: generateBlocks("screenplay", 3000, 1) },
    { format: "manuscript", blocks: generateBlocks("manuscript", 600, 1) },
    ...RULE_SCRIPTS,
  ].flatMap(({ format, blocks }) =>
    blocks
      .filter((b) => b.text !== "")
      .map((b) => ({
        format,
        item: { key: specKey(b.type, b.kind), text: b.text, style: 0 },
        inFont: offFontRanges(b.text).length === 0,
        edge: false,
      })),
  ),
  ...EDGE_PARAGRAPHS.flatMap((e) =>
    KEYS.map((key) => ({
      format: edgeFormat(key),
      item: { key, text: e.text, style: e.style },
      inFont: e.inFont,
      edge: true,
    })),
  ),
];
const FORMATS = [...new Set(sources.map((s) => s.format))];

// One format's items, in-font or not: every `every`-th in-font block, every other block, every edge paragraph.
function itemsFor(
  format: string,
  inFont: boolean,
  every: number,
): ConformanceItem[] {
  const chosen = sources.filter(
    (s) => s.format === format && s.inFont === inFont,
  );
  const blocks = chosen.filter((s) => !s.edge);
  const kept = inFont ? blocks.filter((_, i) => i % every === 0) : blocks;
  return [...kept, ...chosen.filter((s) => s.edge)].map((s) => s.item);
}

interface FormatDifference extends LineDifference {
  readonly format: string;
}

interface Differences {
  readonly inFont: FormatDifference[];
  readonly outsideFont: FormatDifference[];
}

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("conformance");
});
test.afterAll(async () => {
  await harness.stop();
});

// The page's probe once its fonts are ready, reached with brackets: the lint refuses a member name that
// begins with an underscore.
async function openProbe(page: Page): Promise<JSHandle<Conformance>> {
  await page.goto(harness.url);
  const probe = await page.evaluateHandle(() => window["__conf"]);
  expect(await probe.evaluate((conf) => conf.ready)).toBe("ready");
  return probe;
}

async function compareLines(
  browser: Browser,
  options: BrowserContextOptions,
  zoom: number,
  every: number,
): Promise<Differences> {
  const context = await browser.newContext(options);
  try {
    const probe = await openProbe(await context.newPage());
    const differences: Differences = { inFont: [], outsideFont: [] };
    for (const format of FORMATS)
      for (const inFont of [true, false]) {
        const found = await probe.evaluate((conf, input) => conf.run(input), {
          format,
          zoom,
          items: itemsFor(format, inFont, every),
        });
        differences[inFont ? "inFont" : "outsideFont"].push(
          ...found.map((d) => ({ format, ...d })),
        );
      }
    return differences;
  } finally {
    await context.close();
  }
}

function settle(
  info: TestInfo,
  browserName: string,
  differences: Differences,
): void {
  // elsewhere a difference is tracked, not blocked
  if (BLOCKING_ENGINES.includes(browserName))
    expect(differences.inFont).toEqual([]);
  else
    info.annotations.push({
      type: "tracked",
      description: `${differences.inFont.length} in-font and ${differences.outsideFont.length} out-of-font paragraphs differ`,
    });
}

// One row per run, appended to the project's file in the test output folder.
function record(info: TestInfo, row: object): void {
  const file = join(
    info.project.outputDir,
    `conformance-${info.project.name}.json`,
  );
  const rows: unknown = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
  writeFileSync(
    file,
    JSON.stringify([...(Array.isArray(rows) ? rows : []), row], null, 2),
  );
}

for (const scale of SCALES)
  for (const zoom of ZOOMS)
    test(`rendered line starts are the model's at zoom ${zoom} and scale ${scale}`, async ({
      browser,
      browserName,
    }, info) => {
      const differences = await compareLines(
        browser,
        { deviceScaleFactor: scale },
        zoom,
        zoom === 100 && scale === 1 ? 1 : 10,
      );
      record(info, { browserName, scale, zoom, ...differences });
      settle(info, browserName, differences);
    });

test("line starts are the model's in forced colours", async ({
  browser,
  browserName,
}, info) => {
  const differences = await compareLines(
    browser,
    { deviceScaleFactor: 1, forcedColors: "active" },
    100,
    1,
  );
  settle(info, browserName, differences);
});

test("the four faces share one advance, and italic ligatures are off", async ({
  page,
  browserName,
}) => {
  const probe = await openProbe(page);
  // ten cells of 16 × 1228 / 2048 px; Firefox lays text out in sixtieths of a pixel, so a cell is 9.6 px there
  const tenCells = browserName === "firefox" ? 96 : 95.94;
  expect(
    (await probe.evaluate((conf) => conf.advances())).map(
      (a) => Math.round(a * 100) / 100,
    ),
  ).toEqual([tenCells, tenCells, tenCells, tenCells]);
  // four cells, not two
  expect(
    (
      await probe.evaluate((conf) => [
        conf.width("fifl", 2),
        conf.width("fifl", 3),
      ])
    ).map((x) => Math.round(x * 10)),
  ).toEqual([384, 384]);
});
