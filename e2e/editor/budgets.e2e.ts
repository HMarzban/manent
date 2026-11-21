// Typing's hard-fail times in the real editor, in Chromium: keystroke to paint at a script's start, middle and end,
// the editor's own work per keystroke, and what a second writer adds. The benchmark judges the budgets themselves.
import { corpusDoc } from "@manent/pagination/testing";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { editorHook } from "../support/editor-hooks.ts";
import {
  DANA,
  blocks,
  caretAt,
  corpusOfPages,
  groupHook,
  openScript,
  settled,
} from "./support.ts";

const KEYSTROKES = 200;
const INTERVAL_MS = 60;
/** The simulated writer types five characters a second. */
const WRITER_INTERVAL_MS = 200;
/** Where the caret types, as fractions of the script's blocks. */
const POSITIONS = [0.05, 0.5, 0.95] as const;
const TYPED = "the tide turns ";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "the budgets are timed in Chromium",
);

/** The nearest-rank percentile `p` of `samples`; NaN for none, which no limit passes. */
function percentile(samples: readonly number[], p: number): number {
  const sorted = samples.toSorted((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil((p * sorted.length) / 100)) - 1] ?? NaN;
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number) : [];

/** Presses KEYSTROKES keys, one starting every INTERVAL_MS, and resolves to the probe's keydown-to-paint samples, ms. */
async function pressPaced(page: Page): Promise<number[]> {
  await groupHook(page, "keystrokes", "start");
  const startedAt = performance.now();
  for (let k = 0; k < KEYSTROKES; k++) {
    const key = TYPED[k % TYPED.length]!;
    await page.keyboard.press(key === " " ? "Space" : key);
    await page.waitForTimeout(
      Math.max(0, startedAt + (k + 1) * INTERVAL_MS - performance.now()),
    );
  }
  await settled(page);
  return numbers(await groupHook(page, "keystrokes", "stop"));
}

/** The first block of the page two pages above block `index`'s. */
async function twoPagesAbove(page: Page, index: number): Promise<number> {
  const pages = await editorHook(page, "pages");
  const starts = (Array.isArray(pages) ? pages : []).map((start) =>
    Number(start.block),
  );
  const on = starts.findLastIndex((block) => block <= index);
  return starts[Math.max(0, on - 2)] ?? 0;
}

test("typing at 120 pages stays under the hard-fail limits", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openScript(
    page,
    "screenplay",
    corpusDoc(corpusOfPages("screenplay", 120, 1)),
  );
  const found = await blocks(page);
  const places = POSITIONS.map((at) => {
    const from = Math.floor(found.length * at);
    const index = found.findIndex((b, i) => i >= from && b.type === "action");
    return { id: found[index]!.id, index };
  });
  await groupHook(page, "dispatchMs", "start");
  const solo: number[] = [];
  for (const place of places) {
    await caretAt(page, place.id, "end");
    solo.push(...(await pressPaced(page)));
  }
  const dispatched = numbers(await groupHook(page, "dispatchMs", "stop"));
  await groupHook(page, "remote", "join", DANA);
  const withWriter: number[] = [];
  for (const place of places) {
    await caretAt(page, place.id, "end");
    const block = await twoPagesAbove(page, place.index);
    const typed: Promise<unknown>[] = [];
    const writer = setInterval(
      () => typed.push(groupHook(page, "remote", "type", block, 0, "x")),
      WRITER_INTERVAL_MS,
    );
    withWriter.push(...(await pressPaced(page)));
    clearInterval(writer);
    await Promise.all(typed);
  }
  const figures = {
    p50: percentile(solo, 50),
    p95: percentile(solo, 95),
    p99: percentile(solo, 99),
    dispatchP95: percentile(dispatched, 95),
    remoteExtra: percentile(withWriter, 95) - percentile(solo, 95),
  };
  expect(
    {
      samples: [solo.length, withWriter.length],
      p50: figures.p50 < 33,
      p95: figures.p95 < 50,
      p99: figures.p99 < 100,
      dispatch: figures.dispatchP95 < 8,
      remoteExtra: figures.remoteExtra < 16,
    },
    `the figures, ms: ${JSON.stringify(figures)}`,
  ).toEqual({
    samples: [3 * KEYSTROKES, 3 * KEYSTROKES],
    p50: true,
    p95: true,
    p99: true,
    dispatch: true,
    remoteExtra: true,
  });
});
