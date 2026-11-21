// Typing in the real editor: keystroke to paint at the start, middle and end of a script, alone and beside another
// writer, the editor's own work per keystroke, and a paste of fifty pages.
import {
  corpusDoc,
  corpusId,
  generateBlocks,
} from "@manent/pagination/testing";
import { percentile } from "@manent/perf";
import type { Page } from "@playwright/test";
import type { Measurement, Scenario } from "../../harness.ts";
import { scriptOfPages } from "../pagination-engine/script.ts";
import {
  caretAtEnd,
  editorHook,
  openScript,
  openTypingPage,
  pageStarts,
  pasteToPaintMs,
  pressPaced,
  scriptBlocks,
} from "./run-typing.ts";
import type { TypingPage } from "./run-typing.ts";

/** Where the caret types, as fractions of the script's blocks: near its start, its middle and near its end. */
const POSITIONS = [0.05, 0.5, 0.95] as const;
const TYPED = "the tide turns ";
/** The simulated writer types five characters a second. */
const WRITER_INTERVAL_MS = 200;
const WRITER = { userId: "dana", name: "Dana Reyes", colorIndex: 0 };
const PASTES = 5;

/** The seeded screenplay corpus's first `pages` pages: its blocks, and the document of them. */
function scriptDoc(pages: number) {
  const corpus = generateBlocks("screenplay", scriptOfPages(pages).length, 1);
  return { doc: corpusDoc(corpus), corpus };
}

/** Playwright's key names for `count` characters of TYPED, over and over. */
const keysOf = (count: number): string[] =>
  Array.from({ length: count }, (_, k) => {
    const key = TYPED[k % TYPED.length]!;
    return key === " " ? "Space" : key;
  });

/** The first action at or after each of POSITIONS, by id and index. */
async function actionsAt(page: Page): Promise<{ id: string; index: number }[]> {
  const blocks = await scriptBlocks(page);
  return POSITIONS.map((at) => {
    const from = Math.floor(blocks.length * at);
    const index = blocks.findIndex(
      (block, i) => i >= from && block.type === "action",
    );
    if (index === -1)
      throw new RangeError(`the script has no action after block ${from}`);
    return { id: blocks[index]!.id, index };
  });
}

/** The first block of the page two pages above the one block `index` starts on (the first page's, near the top). */
async function twoPagesAbove(page: Page, index: number): Promise<number> {
  const starts = await pageStarts(page);
  const on = starts.findLastIndex((block) => block <= index);
  return starts[Math.max(0, on - 2)]!;
}

/** The simulated writer typing at the start of block `block`, five characters a second, until the returned stop. */
function startWriter(page: Page, block: number): () => Promise<void> {
  const typed: Promise<unknown>[] = [];
  const timer = setInterval(() => {
    typed.push(editorHook(page, ["remote", "type"], block, 0, "x"));
  }, WRITER_INTERVAL_MS);
  return async () => {
    clearInterval(timer);
    await Promise.all(typed);
  };
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number) : [];

async function measureTyping(
  { page }: TypingPage,
  keys: readonly string[],
  intervalMs: number,
): Promise<Measurement[]> {
  const places = await actionsAt(page);
  await editorHook(page, ["dispatchMs", "start"]);
  const alone: number[][] = [];
  for (const place of places) {
    await caretAtEnd(page, place.id);
    alone.push(await pressPaced(page, keys, intervalMs));
  }
  const dispatch = numbers(await editorHook(page, ["dispatchMs", "stop"]));
  await editorHook(page, ["remote", "join"], WRITER);
  const beside: number[][] = [];
  for (const place of places) {
    await caretAtEnd(page, place.id);
    const stop = startWriter(page, await twoPagesAbove(page, place.index));
    beside.push(await pressPaced(page, keys, intervalMs));
    await stop();
  }
  const solo = alone.flat();
  const withWriter = beside.flat();
  const middles = alone.map((samples) => percentile(samples, 50));
  const least = Math.min(...middles);
  return [
    { metric: "keystroke_paint", unit: "ms", samples: solo },
    { metric: "keystroke_paint_remote", unit: "ms", samples: withWriter },
    {
      metric: "remote_extra",
      unit: "ms",
      samples: [percentile(withWriter, 95) - percentile(solo, 95)],
    },
    {
      metric: "position_spread",
      unit: "percent",
      samples: [((Math.max(...middles) - least) / least) * 100],
    },
    { metric: "dispatch", unit: "ms", samples: dispatch },
  ];
}

/**
 * Typing in a screenplay of `pages` pages in Chromium at CPU throttle `throttle` (default 1), `keystrokes` keys
 * (default 200) `intervalMs` apart (default 60) at each of its start, middle and end: `keystroke_paint` alone,
 * `keystroke_paint_remote` with a simulated writer typing five characters a second two pages above the caret,
 * `remote_extra` the second's p95 less the first's, `position_spread` the spread of the three positions' p50 as a
 * percent of the least, and `dispatch` every editor dispatch while typing alone.
 */
export function typingScenario(options: {
  pages: 120 | 2000;
  keystrokes?: number;
  intervalMs?: number;
  throttle?: 1 | 4 | 6;
}): Scenario {
  const { pages, keystrokes = 200, intervalMs = 60, throttle = 1 } = options;
  return {
    id: `typing-${pages}`,
    workload: pages === 120 ? "W1" : "W7",
    processes: 5,
    async run() {
      const { doc, corpus } = scriptDoc(pages);
      const typing = await openTypingPage({ throttle });
      try {
        await openScript(typing.page, doc, corpus.length);
        return await measureTyping(typing, keysOf(keystrokes), intervalMs);
      } finally {
        await typing.close();
      }
    },
  };
}

const escaped = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/** The clipboard HTML of fifty pages of the corpus, each block `<p data-type data-id>` as the page writes it. */
function fiftyPagesHtml(): string {
  return generateBlocks("screenplay", scriptOfPages(50).length, 1)
    .map(
      (block, i) =>
        `<p data-type="${block.type}" data-id="${corpusId(i)}">${escaped(block.text)}</p>`,
    )
    .join("");
}

/** `paste_paint`: five pastes of fifty pages, each at the end of a fresh 20-page screenplay, paste event to paint. */
export function pasteScenario(): Scenario {
  return {
    id: "paste-50",
    workload: null,
    processes: 5,
    async run() {
      const { doc, corpus } = scriptDoc(20);
      const html = fiftyPagesHtml();
      const typing = await openTypingPage({ throttle: 1 });
      try {
        const samples: number[] = [];
        for (let n = 0; n < PASTES; n++) {
          await openScript(typing.page, doc, corpus.length);
          await caretAtEnd(typing.page, corpusId(corpus.length - 1));
          samples.push(await pasteToPaintMs(typing.page, html));
        }
        return [{ metric: "paste_paint", unit: "ms", samples }];
      } finally {
        await typing.close();
      }
    },
  };
}
