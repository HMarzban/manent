// Export and Print from the Send screen: what leaves is the pages the open editor shows.
import { readFile } from "node:fs/promises";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
} from "@manent/pagination";
import type {
  Engine,
  PageProfile,
  Pagination,
  PositionedLine,
} from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { blocksOf, parseDoc } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { editorHook, keepEveryHooks } from "../support/editor-hooks.ts";
import { labelOf, pressKeyOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

/** The engine and profile the editor lays out a new screenplay with. */
function editorLayout(): { engine: Engine; profile: PageProfile } {
  const engine = engineFor(ENGINE_VERSION);
  const profile =
    engine === null
      ? null
      : profileFromSettings(engine, DEFAULT_LAYOUT_SETTINGS);
  if (engine === null || profile === null)
    throw new TypeError("no screenplay profile in this build");
  return { engine, profile };
}
const { engine, profile } = editorLayout();

interface PageStart {
  label: string | null;
  firstLine: string;
}

const PAGES = 120;
const DUAL_PAIR: readonly CorpusBlock[] = [
  { type: "character", text: "DANA", kind: null, dual: "left" },
  { type: "dialogue", text: "Is the lamp lit?", kind: null, dual: "left" },
  { type: "character", text: "SAM", kind: null, dual: "right" },
  { type: "dialogue", text: "Since dusk.", kind: null, dual: "right" },
];
const FORCED_BREAK: CorpusBlock = {
  type: "page_break",
  text: "",
  kind: null,
  dual: null,
};

/** The corpus's first `count` blocks with a dual-dialogue pair and a forced break among them. */
function scriptOf(count: number): DocJSON {
  const blocks = generateBlocks("screenplay", count, 7);
  return corpusDoc([
    ...blocks.slice(0, 12),
    ...DUAL_PAIR,
    ...blocks.slice(12, 30),
    FORCED_BREAK,
    ...blocks.slice(30),
  ]);
}

const paginated = (doc: DocJSON): Pagination =>
  engine.paginate(engine.toLayoutBlocks(blocksOf(parseDoc(doc))), profile);

/** The shortest such script with exactly `pages` pages: its page count never falls as blocks are added. */
function scriptOfPages(pages: number): { doc: DocJSON; p: Pagination } {
  const pagesAt = (count: number): number =>
    paginated(scriptOf(count)).pages.length;
  let high = pages;
  while (pagesAt(high) < pages) high *= 2;
  let low = 0;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (pagesAt(middle) < pages) low = middle;
    else high = middle;
  }
  const doc = scriptOf(high);
  const p = paginated(doc);
  if (p.pages.length !== pages)
    throw new RangeError(`no script of exactly ${pages} pages`);
  return { doc, p };
}

const noSpace = (s: string): string => s.replace(new RegExp("\\s+", "g"), "");

const textOf = (line: PositionedLine): string =>
  line.runs.map((run) => run.text).join("");

/** Each page as the engine lays it out: its printed number without its period, and its first row below the top margin. */
function layoutStarts(p: Pagination): PageStart[] {
  return p.pages.map((_, k) => {
    const { lines } = engine.layoutPage(p, k);
    const number = lines.find((line) => line.kind === "page_number");
    const top = Math.min(
      ...lines.filter((line) => line.y >= 0).map((line) => line.y),
    );
    return {
      label:
        number === undefined
          ? null
          : textOf(number).replace(new RegExp("\\.$"), ""),
      firstLine: noSpace(
        lines
          .filter((line) => line.y === top)
          .toSorted((a, b) => a.x - b.x)
          .map(textOf)
          .join(""),
      ),
    };
  });
}

/** Each page of a PDF as pdf.js reads it: the number in its top margin without its period, and its first row below. */
async function pdfStarts(
  bytes: Uint8Array,
  marginTopPt: number,
): Promise<PageStart[]> {
  // pdf.js detaches the buffer it is given
  const task = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  const starts: PageStart[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const height = page.view[3] ?? 0;
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of (await page.getTextContent()).items) {
      if (!("str" in item) || item.str === "") continue;
      const y = Math.round((height - item.transform[5]) * 100) / 100;
      rows.set(y, [
        ...(rows.get(y) ?? []),
        { x: item.transform[4], text: item.str },
      ]);
    }
    const lines = [...rows]
      .toSorted(([a], [b]) => a - b)
      .map(([y, row]) => ({
        y,
        text: row
          .toSorted((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(""),
      }));
    const margin = lines.find((line) => line.y < marginTopPt);
    const first = lines.find((line) => line.y >= marginTopPt);
    starts.push({
      label: margin?.text.trim().replace(new RegExp("\\.$"), "") ?? null,
      firstLine: noSpace(first?.text ?? ""),
    });
  }
  await task.destroy();
  return starts;
}

/** Opens a new screenplay holding `doc` with `access`, through the test build's hooks. */
async function openScript(
  page: Page,
  doc: DocJSON,
  access: "edit" | "view",
): Promise<void> {
  await keepEveryHooks(page);
  await signedInAs(page, "you");
  // a page drawn first, so the hooks that find it can be told apart
  await page
    .getByRole("button", { name: labelOf("library.newScript") })
    .first()
    .click();
  await expect(page.locator(".mn-page-view")).toBeAttached();
  await editorHook(page, "open", "screenplay", doc, access);
}

/**
 * Keeps the name the page gives each file it saves, in `window.__savedNames`: the browser may rewrite it before it
 * reports the download (WebKit on Linux turns each space into "_").
 */
async function keepSavedNames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const names: string[] = [];
    Reflect.set(window, "__savedNames", names);
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download !== "") names.push(this.download);
      click.call(this);
    };
  });
}

const savedNames = (page: Page): Promise<unknown> =>
  page.evaluate(() => Reflect.get(window, "__savedNames"));

/** Title ▾ → Export…, then the form's button: the file it saves. */
async function exportFromTitle(page: Page): Promise<Download> {
  await page
    .locator("[data-region='title_bar'] [data-slot='dropdown-menu-trigger']")
    .click();
  await page.getByRole("menuitem", { name: "Export…" }).click();
  const button = page.getByRole("button", { name: "Export 1 file" });
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  return download;
}

const bytesOf = async (download: Download): Promise<Uint8Array> =>
  new Uint8Array(await readFile(await download.path()));

test("Export from Title ▾ downloads the PDF of the pages on screen", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const { doc, p } = scriptOfPages(PAGES);
  const expected = layoutStarts(p);
  await keepSavedNames(page);
  await openScript(page, doc, "edit");
  const onScreen = await editorHook(page, "pages");
  const first = await exportFromTitle(page);
  const exported = await pdfStarts(
    await bytesOf(first),
    profile.geometry.marginTopPt,
  );
  await expect(page.getByText("Exported 'Untitled script'.")).toBeVisible();
  await context.setOffline(true);
  const offline = await exportFromTitle(page);
  const again = await pdfStarts(
    await bytesOf(offline),
    profile.geometry.marginTopPt,
  );
  expect(onScreen).toEqual(
    p.pages.map(({ label, block, line }) => ({ label, block, line })),
  );
  expect([
    await savedNames(page),
    exported.length,
    exported.map((start) => start.label),
  ]).toEqual([
    ["Untitled script.pdf", "Untitled script.pdf"],
    PAGES,
    p.pages.map(({ label }, k) => (k === 0 ? null : label)),
  ]);
  expect(exported).toEqual(expected);
  expect(again).toEqual(exported);
});

/** The page's paper as the theme resolves it for a sheet now. */
const paperNow = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--page-paper)";
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  });

test("Print in the dark theme prints white pages", async ({ page }) => {
  test.setTimeout(120_000);
  const { doc } = scriptOfPages(PAGES);
  await openScript(page, doc, "edit");
  const light = await paperNow(page);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await paperNow(page);
  await page.evaluate(() => {
    Reflect.set(window, "__printed", 0);
    window.print = () => {
      Reflect.set(
        window,
        "__printed",
        Number(Reflect.get(window, "__printed")) + 1,
      );
    };
  });
  await pressKeyOf(page, "doc.print");
  await page.getByRole("button", { name: `Print ${PAGES} pages` }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__printed")))
    .toBe(1);
  await page.emulateMedia({ colorScheme: "dark", media: "print" });
  const printed = await page.evaluate(() => {
    const root = document.getElementById("mn-print");
    const sheet = root?.firstElementChild;
    return {
      pages: root?.childElementCount ?? 0,
      shown: root === null ? null : getComputedStyle(root).display,
      paper:
        sheet instanceof HTMLElement
          ? getComputedStyle(sheet).backgroundColor
          : null,
    };
  });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  expect(dark).not.toBe(light);
  expect(printed).toEqual({ pages: PAGES, shown: "block", paper: light });
  await expect(page.locator("#mn-print")).toHaveCount(0);
});

test("a viewer can export", async ({ page }) => {
  await openScript(page, scriptOf(20), "view");
  const download = await exportFromTitle(page);
  const bytes = await bytesOf(download);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
});
