import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { layoutPage, paginate, profileFor } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import {
  block,
  generateBlocks,
  layoutBlocksOf,
} from "@manent/pagination/testing";
import { printCss, printPages } from "../src/send/print-pages.ts";

withDom();

const SCREENPLAY = profileFor("screenplay");
if (SCREENPLAY === null) throw new TypeError("no screenplay profile");

const corpus = (blocks: number): Pagination =>
  paginate(
    layoutBlocksOf(generateBlocks("screenplay", blocks, 40)),
    SCREENPLAY,
  );

/** `count` pages, each one line of action ended by a page break. */
const pagesOf = (count: number): Pagination =>
  paginate(
    Array.from({ length: count }, (_, k) => [
      block("action", `The lamp is lit on page ${k + 1}.`),
      block("page_break", ""),
    ])
      .flat()
      .slice(0, -1),
    SCREENPLAY,
  );

const immediate = {
  request(fn: () => void): () => void {
    fn();
    return () => {};
  },
};
const never = new AbortController().signal;

const pageText = (page: Element): (string | null)[] =>
  [...page.children].map((line) => line.textContent);

test("print draws every page at its paper's size with the engine's lines", async () => {
  const p = corpus(400);
  const root = await printPages(p, { frames: immediate, signal: never });
  const first = root.children[0];
  if (!(first instanceof HTMLElement)) throw new TypeError("no first page");
  expect([root.id, root.children.length]).toEqual(["mn-print", p.pages.length]);
  expect([...root.children].map(pageText)).toEqual(
    p.pages.map((_, k) =>
      layoutPage(p, k).lines.map((l) => l.runs.map((r) => r.text).join("")),
    ),
  );
  expect([first.style.width, first.style.height]).toEqual(["612pt", "792pt"]);
  expect(printCss(p)).toContain("@page { size: 612pt 792pt; margin: 0 }");
  root.remove();
});

test("a line sits on the page's grid in points, its runs styled by their bits", async () => {
  const p = paginate(
    [
      block("action", "Dana waits.", {
        styles: new Uint8Array([1, 1, 1, 1, 1, 0, 2, 2, 4, 4, 8]),
      }),
    ],
    SCREENPLAY,
  );
  const root = await printPages(p, { frames: immediate, signal: never });
  const line = root.children[0]?.children[0];
  if (!(line instanceof HTMLElement)) throw new TypeError("no line");
  const [x, y] = [layoutPage(p, 0).lines[0]?.x, layoutPage(p, 0).lines[0]?.y];
  expect([x, y]).toEqual([0, 0]);
  expect([
    line.style.left,
    line.style.top,
    [...line.children].map((span) =>
      span instanceof HTMLElement
        ? [
            span.textContent,
            span.style.fontWeight,
            span.style.fontStyle,
            span.style.textDecorationLine,
          ]
        : null,
    ),
  ]).toEqual([
    "108pt",
    "72pt",
    [
      ["Dana ", "700", "", ""],
      ["w", "", "", ""],
      ["ai", "", "italic", ""],
      ["ts", "", "", "underline"],
      [".", "", "", "line-through"],
    ],
  ]);
  root.remove();
});

test("a print that is abandoned stops building", async () => {
  const p = pagesOf(2000);
  let queued: (() => void)[] = [];
  const frames = {
    request(fn: () => void): () => void {
      queued.push(fn);
      return () => {
        queued = queued.filter((f) => f !== fn);
      };
    },
  };
  const fire = (): void => {
    const due = queued;
    queued = [];
    for (const fn of due) fn();
  };
  const controller = new AbortController();
  const built = printPages(p, { frames, signal: controller.signal });
  fire();
  const afterOneFrame =
    document.getElementById("mn-print")?.children.length ?? 0;
  controller.abort();
  const outcome = await built.then(
    () => "printed",
    (error: unknown) => (error instanceof Error ? error.name : "thrown"),
  );
  fire();
  expect([
    outcome,
    afterOneFrame > 0 && afterOneFrame < p.pages.length,
    document.querySelectorAll("#mn-print").length,
    queued.length,
  ]).toEqual(["AbortError", true, 0, 0]);
});

test("print renders page furniture including watermark onto every sheet", async () => {
  const p = pagesOf(2);
  const root = await printPages(p, {
    frames: immediate,
    signal: never,
    furniture: { watermark: "Leo Marsh" },
  });
  expect(
    [...root.querySelectorAll(".mn-watermark")].map((el) => [
      el.textContent,
      (el as HTMLElement).style.top,
    ]),
  ).toEqual([
    ["Leo Marsh", "1024px"],
    ["Leo Marsh", "1024px"],
  ]);
  root.remove();
});
