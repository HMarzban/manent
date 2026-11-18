// The pages drawn on screen against the same script's PDF: every page starts with the same line under the same label.
import { writePdf } from "@manent/formats";
import type { ScriptFontFiles } from "@manent/formats";
import { paginate, profileFor, toLayoutBlocks } from "@manent/pagination";
import type { FontFaceKey } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { serveHarness } from "./harness/serve.ts";

interface PageStart {
  label: string | null;
  firstLine: string;
}

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

const SCRIPTS = [
  { script: "corpus:750", format: "screenplay", paper: "letter" },
  { script: "corpus:750", format: "screenplay", paper: "a4" },
  { script: "corpus:750", format: "multicam", paper: "letter" },
  { script: "corpus:750", format: "manuscript", paper: "letter" },
  { script: "corpus:750", format: "stage_play", paper: "letter" },
  // the corpus has no dual dialogue: a tall run split across pages
  { script: "tall-dual", format: "screenplay", paper: "letter" },
] as const;

/** Two lengths closer than this, in points, are read as equal. */
const NEAR_PT = 0.01;

const squash = (s: string) => s.replace(new RegExp("\\s+", "g"), " ").trim();

const woff = (key: FontFaceKey) =>
  Bun.file(
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      import.meta.dirname,
    ),
  ).bytes();

async function loadWoff(): Promise<ScriptFontFiles> {
  return {
    "latin-400-normal": await woff("latin-400-normal"),
    "latin-400-italic": await woff("latin-400-italic"),
    "latin-700-normal": await woff("latin-700-normal"),
    "latin-700-italic": await woff("latin-700-italic"),
    "latin-ext-400-normal": await woff("latin-ext-400-normal"),
    "latin-ext-400-italic": await woff("latin-ext-400-italic"),
    "latin-ext-700-normal": await woff("latin-ext-700-normal"),
    "latin-ext-700-italic": await woff("latin-ext-700-italic"),
  };
}

interface Span {
  x: number;
  end: number;
  text: string;
}

// pdf.js ends an item at every space as wide as 0.6 em, as every space on the script's grid is: items
// that touch are joined into one again.
function joinTouching(spans: readonly Span[]): Span[] {
  const joined: Span[] = [];
  for (const span of spans.toSorted((a, b) => a.x - b.x)) {
    const last = joined.at(-1);
    if (last !== undefined && Math.abs(span.x - last.end) < NEAR_PT)
      joined[joined.length - 1] = {
        x: last.x,
        end: span.end,
        text: last.text + span.text,
      };
    else joined.push(span);
  }
  return joined;
}

/**
 * Each page of a PDF as pdf.js reads it: the page number in the top margin without its period (null when there
 * is none), and the first line below the margin. Baselines are in points from the top of the page.
 */
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
    const height = page.view[3]!;
    const rows = new Map<number, Span[]>();
    for (const item of (await page.getTextContent()).items) {
      if (!("str" in item) || item.str === "") continue;
      const x = item.transform[4];
      const y = Math.round((height - item.transform[5]) * 100) / 100;
      const row = rows.get(y) ?? [];
      row.push({ x, end: x + item.width, text: item.str });
      rows.set(y, row);
    }
    const lines = [...rows]
      .toSorted(([a], [b]) => a - b)
      .map(([y, row]) => ({ y, items: joinTouching(row) }));
    const margin = lines.find((line) => line.y < marginTopPt);
    const first = lines.find((line) => line.y >= marginTopPt);
    starts.push({
      label: margin?.items.at(-1)?.text.replace(new RegExp("\\.$"), "") ?? null,
      firstLine: squash(first?.items.map((item) => item.text).join("") ?? ""),
    });
  }
  await task.destroy();
  return starts;
}

/**
 * Each page as the screen draws it: the label of the break that opens it (null on the first page), and the
 * first row of its text: each column's (CONT'D) cue when the break draws one, and the text from its first line
 * start to the next, as shown, with the furniture drawn on that line.
 */
function screenStarts(page: Page): Promise<PageStart[]> {
  return page.evaluate(() => {
    const probe = window["__mn"];
    // pieces whose tops are closer than this, in px, are on one row
    const ROW_PX = 4;
    // page furniture inside a block holds no text of the block
    const FURNITURE = ".pb, .lb";
    interface Piece {
      readonly top: number;
      readonly text: string;
    }
    const textNodes = (el: HTMLElement): Text[] => {
      const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node instanceof Text) return NodeFilter.FILTER_ACCEPT;
            return node instanceof Element && node.matches(FURNITURE)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_SKIP;
          },
        },
      );
      const nodes: Text[] = [];
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode())
        if (n instanceof Text) nodes.push(n);
      return nodes;
    };
    // the block's text before the widget inside it
    const offsetOf = (el: HTMLElement, widget: Element): number => {
      let at = 0;
      for (const node of textNodes(el)) {
        if (
          widget.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
          break;
        at += node.data.length;
      }
      return at;
    };
    // the line of `el` that starts at `from`, as shown, with its scene numbers on either side
    const lineAt = (el: HTMLElement, from: number): Piece[] => {
      const nodes = textNodes(el);
      const length = nodes.reduce((sum, node) => sum + node.data.length, 0);
      const to = probe.lineStarts(el).dom.find((s) => s > from) ?? length;
      let text = "";
      let top: number | null = null;
      let at = 0;
      for (const node of nodes) {
        const a = Math.max(from - at, 0);
        const b = Math.min(to - at, node.data.length);
        if (a < b) {
          const part = node.data.slice(a, b);
          text +=
            getComputedStyle(node.parentElement!).textTransform === "uppercase"
              ? part.toUpperCase()
              : part;
          const range = document.createRange();
          range.setStart(node, a);
          range.setEnd(node, a + 1);
          top ??= range.getClientRects()[0]!.top;
        }
        at += node.data.length;
      }
      const d = el.dataset;
      const shown =
        (from === 0 ? (d["open"] ?? "") : "") +
        text +
        (to === length ? (d["contd"] ?? "") + (d["close"] ?? "") : "");
      const scene = from === 0 ? d["scene"] : undefined;
      const pieces = scene === undefined ? [shown] : [scene, shown, scene];
      return pieces.map((t) => ({ top: top!, text: t }));
    };
    // a column opened by `widget`: its (CONT'D) cue and its first line
    const columnAt = (widget: HTMLElement): Piece[] => {
      // a break inside a block is a span; one between blocks sits just before its page's first block
      const inside = widget.tagName === "SPAN";
      const el = inside ? widget.closest("p.el") : widget.nextElementSibling;
      if (!(el instanceof HTMLElement))
        throw new RangeError(`no block after the break ${widget.className}`);
      const pieces: Piece[] = [];
      const contd = widget.querySelector<HTMLElement>(":scope > .pb-contd");
      const cue = contd?.dataset["text"];
      if (cue !== undefined)
        pieces.push({ top: contd!.getBoundingClientRect().top, text: cue });
      pieces.push(...lineAt(el, inside ? offsetOf(el, widget) : 0));
      return pieces;
    };
    // each page's opening break with its pieces; a split dual run's right column joins the page it opens on
    const pages: { widget: HTMLElement; pieces: Piece[] }[] = [];
    for (const widget of probe.view.dom.querySelectorAll<HTMLElement>(
      ".pb:not(.pb-last)",
    )) {
      if (widget.matches(".pb-col"))
        pages.at(-1)!.pieces.push(...columnAt(widget));
      else pages.push({ widget, pieces: columnAt(widget) });
    }
    return pages.map(({ widget, pieces }) => {
      const top = Math.min(...pieces.map((p) => p.top));
      return {
        label: widget.matches(".pb-first") ? null : widget.dataset["label"]!,
        firstLine: pieces
          .filter((p) => p.top - top < ROW_PX)
          .map((p) => p.text)
          .join(" "),
      };
    });
  });
}

test("the page on screen is the page in the PDF", async ({ page }) => {
  const fonts = await loadWoff();
  for (const { script, format, paper } of SCRIPTS) {
    await page.goto(
      `${harness.url}?script=${script}&format=${format}&paper=${paper}`,
    );
    expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
    // every section laid out, so that pages far below can be read
    await page.addStyleTag({
      content: ".section { content-visibility: visible !important; }",
    });
    const screen = (await screenStarts(page)).map(({ label, firstLine }) => ({
      label,
      firstLine: squash(firstLine),
    }));
    const doc: DocJSON = await page.evaluate(() =>
      window["__mn"].view.state.doc.toJSON(),
    );
    const profile = profileFor(format, { paper })!;
    const p = paginate(toLayoutBlocks(blocksOf(doc)), profile);
    const pdf = await pdfStarts(
      await writePdf(p, { fonts }),
      profile.geometry.marginTopPt,
    );
    expect(screen, `${script} as ${format} on ${paper}`).toEqual(pdf);
  }
});
