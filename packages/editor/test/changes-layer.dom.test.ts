import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { compareDocs } from "@manent/revisions";
import { parseDoc } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { EditorState } from "prosemirror-state";
import {
  changesPlugin,
  createMarkLayer,
  markPosition,
  paginationKey,
  setChanges,
} from "../src/index.ts";
import type { ChangesDisplay } from "../src/index.ts";
import { state } from "./docs.ts";

withDom();

const LETTER_SCREENPLAY = profileFor("screenplay")!;

/** The document with each block whose id `changed` holds given other text. */
function withText(doc: DocJSON, changed: ReadonlySet<string>): DocJSON {
  const edit = (block: BlockJSON): BlockJSON =>
    changed.has(String(block.attrs?.id))
      ? { ...block, content: [{ type: "text", text: "Rain on the glass." }] }
      : block;
  return {
    type: "doc",
    content: (doc.content ?? []).map((section) => ({
      type: "section",
      content: (section.content ?? []).map(edit),
    })),
  };
}

/** A state of `live` with the pagination and changes plugins, showing the changes since `baseline`. */
function withChanges(
  live: DocJSON,
  baseline: DocJSON,
  display: ChangesDisplay,
): EditorState {
  const plain = state(parseDoc(live));
  const s = EditorState.create({
    doc: plain.doc,
    plugins: [...plain.plugins, changesPlugin()],
  });
  return s.apply(
    setChanges(s.tr, {
      baseline,
      comparison: compareDocs(baseline, live),
      display,
    }),
  );
}

/** For each page given, the first one-line block that starts on it, with its line's y. */
function oneLineBlocks(
  s: EditorState,
  pages: readonly number[],
): { id: string; y: number }[] {
  const { pagination, settings } = paginationKey.getState(s)!;
  const indexOf = new Map(pagination.blocks.map((b, i) => [b.id, i]));
  return pages.map((page) => {
    const line = settings.engine
      .layoutPage(pagination, page)
      .lines.find(
        (l) =>
          l.kind === "text" &&
          l.blockId !== null &&
          settings.engine.lineStartsOf(pagination, indexOf.get(l.blockId)!)
            .length === 1,
      )!;
    return { id: line.blockId!, y: line.y };
  });
}

const topsOf = (pages: HTMLElement, selector: string): number[] =>
  [...pages.querySelectorAll<HTMLElement>(selector)].map((el) =>
    Number.parseFloat(el.style.top),
  );

test("an asterisk sits at the right margin of each changed line", () => {
  expect(markPosition(LETTER_SCREENPLAY, 1, 10)).toEqual({
    topPx: 1056 + 24 + 96 + 80,
    rightPx: 816 - 96 + 9.6,
    gutterPx: 824,
  });
});

test("the layer draws the pages in view and nothing else", () => {
  const live = corpusDoc(generateBlocks("screenplay", 640, 1));
  const marked = [0, 2, 3, 4, 6, 9, 12, 17, 22, 28, 33, 39];
  const blocks = oneLineBlocks(withChanges(live, live, "asterisks"), marked);
  const s = withChanges(
    live,
    withText(live, new Set(blocks.map(({ id }) => id))),
    "asterisks",
  );
  // with display "asterisks" the authors are never drawn
  const authors = new Map(
    blocks.map(({ id }) => [id, { initials: "MA", colour: 1 }]),
  );
  const pages = document.createElement("div");
  const layer = createMarkLayer(pages);
  layer.update(
    s,
    Array.from({ length: 40 }, (_, i) => i),
    authors,
  );
  const all = topsOf(pages, ".mn-asterisk").length;
  layer.update(s, [3, 4], authors);
  expect([
    paginationKey.getState(s)!.pagination.pages.length,
    all,
    topsOf(pages, ".mn-asterisk"),
    topsOf(pages, ".mn-marker"),
  ]).toEqual([
    40,
    12,
    [
      markPosition(LETTER_SCREENPLAY, 3, blocks[2]!.y).topPx,
      markPosition(LETTER_SCREENPLAY, 4, blocks[3]!.y).topPx,
    ],
    [],
  ]);
});

const block = (
  type: string,
  text: string,
  dual: "left" | "right" | null = null,
): CorpusBlock => ({ type, text, kind: null, dual });

const onFirstPage = (y: number) => markPosition(LETTER_SCREENPLAY, 0, y);

test("two authors on one line show a count", () => {
  const live = corpusDoc([
    block("scene_heading", "INT. FERRY - NIGHT"),
    block("character", "MARA", "left"),
    block("dialogue", "We wait.", "left"),
    block("character", "TOMAS", "right"),
    block("dialogue", "We go.", "right"),
    block("action", "The horn sounds."),
  ]);
  const ids = ["blk_000000000002", "blk_000000000004", "blk_000000000005"];
  const s = withChanges(live, withText(live, new Set(ids)), "page");
  const pages = document.createElement("div");
  createMarkLayer(pages).update(
    s,
    [0],
    new Map([
      [ids[0]!, { initials: "MA", colour: 1 }],
      [ids[1]!, { initials: "TO", colour: 2 }],
      [ids[2]!, { initials: "MA", colour: 1 }],
    ]),
  );
  expect([
    topsOf(pages, ".mn-asterisk"),
    [...pages.querySelectorAll<HTMLElement>(".mn-marker")].map((el) => [
      Number.parseFloat(el.style.top),
      Number.parseFloat(el.style.left),
      el.textContent,
      el.dataset["who"] ?? null,
    ]),
  ]).toEqual([
    [onFirstPage(6).topPx, onFirstPage(10).topPx],
    [
      [onFirstPage(6).topPx, 824, "2", null],
      [onFirstPage(10).topPx, 824, "MA", "1"],
    ],
  ]);
});
