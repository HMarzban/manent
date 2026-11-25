// Typing in the real editor: keystroke to paint at the start, middle and end of a script or across its section
// boundaries, alone and beside another writer, the editor's own work per keystroke, and a paste of fifty pages.
import { corpusId, generateBlocks } from "@manent/pagination/testing";
import { percentile } from "@manent/perf";
import type { Page } from "@playwright/test";
import { documentOfPages } from "../../corpus/documents.ts";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import type { BenchBrowser } from "../driver.ts";
import { scriptOfPages } from "../pagination-engine/script.ts";
import {
  caretAt,
  editorHook,
  openScript,
  pageStarts,
  pasteToPaintMs,
  pressPaced,
  scriptBlocks,
} from "./run-typing.ts";
import type { ScriptBlock } from "./run-typing.ts";

type TypingFormat = "screenplay" | "manuscript";

/** Where the caret types, as fractions of the script's blocks: near its start, its middle and near its end. */
const POSITIONS = [0.05, 0.5, 0.95] as const;
/** The element typed into, in each format: the one that holds running prose. */
const PROSE: Readonly<Record<TypingFormat, string>> = {
  screenplay: "action",
  manuscript: "body",
};
const TYPED = "the tide turns ";
/** Keys typed at each place, by mode; a quick run keeps a few samples. */
const KEYSTROKES = { quick: 1, standard: 200, full: 200 } as const;
/** At a section boundary, an Enter and a Backspace follow every this many keys. */
const BOUNDARY_EVERY = 20;
/** The simulated writer types five characters a second. */
const WRITER_INTERVAL_MS = 200;
const WRITER = { userId: "dana", name: "Dana Reyes", colorIndex: 0 };
const PASTES = 5;

/** Playwright's key names for `count` characters of TYPED, over and over. */
const keysOf = (count: number): string[] =>
  Array.from({ length: count }, (_, k) => {
    const key = TYPED[k % TYPED.length]!;
    return key === " " ? "Space" : key;
  });

/** keysOf(count), with an Enter and a Backspace after every BOUNDARY_EVERY of them. */
const boundaryKeysOf = (count: number): string[] =>
  keysOf(count).flatMap((key, k) =>
    (k + 1) % BOUNDARY_EVERY === 0 ? [key, "Enter", "Backspace"] : [key],
  );

/** One run of keys at one place: the block, which edge of it the caret starts at, and the keys. */
interface Leg {
  id: string;
  edge: "start" | "end";
  keys: readonly string[];
}

/** Where one position types: the block index the writer works above, and the legs typed there. */
interface Place {
  index: number;
  legs: Leg[];
}

/** The first block of `element` at or after each of POSITIONS, typed into at its end. */
function prosePlaces(
  blocks: readonly ScriptBlock[],
  element: string,
  keys: readonly string[],
): Place[] {
  return POSITIONS.map((at) => {
    const from = Math.floor(blocks.length * at);
    const index = blocks.findIndex(
      (block, i) => i >= from && block.type === element,
    );
    if (index === -1)
      throw new RangeError(`the script has no ${element} after block ${from}`);
    return { index, legs: [{ id: blocks[index]!.id, edge: "end", keys }] };
  });
}

/**
 * At each of POSITIONS, the boundary after the section it falls in (before it, in the last section): keys at the end
 * of that section's last block, then at the start of the next section's first block.
 */
function boundaryPlaces(
  blocks: readonly ScriptBlock[],
  keys: readonly string[],
): Place[] {
  const last = blocks.at(-1)!.section;
  return POSITIONS.map((at) => {
    const section = Math.min(
      blocks[Math.floor(blocks.length * at)]!.section,
      last - 1,
    );
    const index = blocks.findLastIndex((block) => block.section === section);
    if (index === -1 || index + 1 >= blocks.length)
      throw new RangeError(
        `the script has no boundary after section ${section}`,
      );
    return {
      index,
      legs: [
        { id: blocks[index]!.id, edge: "end", keys },
        { id: blocks[index + 1]!.id, edge: "start", keys },
      ],
    };
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

/** Each place's keystroke-to-paint samples, every leg of it in turn. */
async function typeAt(
  page: Page,
  place: Place,
  intervalMs: number,
): Promise<number[]> {
  const samples: number[] = [];
  for (const leg of place.legs) {
    await caretAt(page, leg.id, leg.edge);
    samples.push(...(await pressPaced(page, leg.keys, intervalMs)));
  }
  return samples;
}

/** 05's five metrics over `places`: alone, then beside the simulated writer two pages above each. */
async function measureTyping(
  page: Page,
  places: readonly Place[],
  intervalMs: number,
): Promise<Measurement[]> {
  await editorHook(page, ["dispatchMs", "start"]);
  const alone: number[][] = [];
  for (const place of places) alone.push(await typeAt(page, place, intervalMs));
  const dispatch = numbers(await editorHook(page, ["dispatchMs", "stop"]));
  await editorHook(page, ["remote", "join"], WRITER);
  const beside: number[][] = [];
  for (const place of places) {
    const stop = startWriter(page, await twoPagesAbove(page, place.index));
    beside.push(await typeAt(page, place, intervalMs));
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

/** What a typing scenario changes from a screenplay in sections typed at three positions; its id names it. */
type TypingKind = "plain" | "book" | "flat" | "boundary";

/** The workload each kind stands for; a plain one's depends on its length. */
const KIND_WORKLOADS: Readonly<
  Record<Exclude<TypingKind, "plain">, Scenario["workload"]>
> = { book: "W7", flat: "W6", boundary: "W7" };
/** A plain script's workload by length: W1's film and W7's length; the comfort envelope's other lengths have none. */
const PLAIN_WORKLOADS: Readonly<Record<number, Scenario["workload"]>> = {
  120: "W1",
  2000: "W7",
};

function kindOf(options: {
  format: TypingFormat;
  sections: "even" | "one";
  at: "positions" | "boundaries";
}): TypingKind {
  if (options.format === "manuscript") return "book";
  if (options.sections === "one") return "flat";
  return options.at === "boundaries" ? "boundary" : "plain";
}

/** Turns `spellcheck="true"` on every section and editor root in the open script (used by spellcheck scenarios). */
async function enableSpellcheck(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll(
      "[data-editor-host] [spellcheck], [data-editor-host] .ProseMirror, [data-editor-host] section",
    )) {
      element.setAttribute("spellcheck", "true");
    }
  });
}

/**
 * Typing in the corpus's document of `pages` pages (seed 1) of `format` (default screenplay) in `sections` (default
 * "even"), opened through the editor's hooks, `keystrokes` keys a place (by mode, KEYSTROKES, when not given)
 * `intervalMs` apart (default 60), at the start, middle and end of the script, or across the section boundary nearest
 * each (`at: "boundaries"`, with an Enter and a Backspace every 20 keys): `keystroke_paint` alone,
 * `keystroke_paint_remote` with a simulated writer typing five characters a second two pages above the caret,
 * `remote_extra` the second's p95 less the first's, `position_spread` the spread of the three places' p50 as a
 * percent of the least, `dispatch` every editor dispatch while typing alone, and `input_blocks`.
 */
export function typingScenario(options: {
  id?: string;
  pages: number;
  format?: TypingFormat;
  sections?: "even" | "one";
  at?: "positions" | "boundaries";
  keystrokes?: number;
  intervalMs?: number;
  browser?: BenchBrowser;
  headed?: boolean;
  spellcheck?: boolean;
}): Scenario {
  const {
    pages,
    format = "screenplay",
    sections = "even",
    at = "positions",
    intervalMs = 60,
    browser,
    headed,
    spellcheck = false,
  } = options;
  const kind = kindOf({ format, sections, at });
  const defaultId =
    kind === "plain" ? `typing-${pages}` : `typing-${kind}-${pages}`;
  return {
    id: options.id ?? defaultId,
    workload:
      kind === "plain"
        ? (PLAIN_WORKLOADS[pages] ?? null)
        : KIND_WORKLOADS[kind],
    processes: 5,
    async run() {
      const d = documentOfPages({ format, pages, seed: 1, sections });
      const count = options.keystrokes ?? KEYSTROKES[benchMode()];
      const demo = await startBenchDemo({
        ...(browser === undefined ? {} : { browser }),
        ...(headed === undefined ? {} : { headed }),
      });
      try {
        const { page } = await demo.openPage({ userId: "you" });
        await openScript(page, format, d.doc, d.blocks);
        if (spellcheck) await enableSpellcheck(page);
        const blocks = await scriptBlocks(page);
        const places =
          at === "boundaries"
            ? boundaryPlaces(blocks, boundaryKeysOf(count))
            : prosePlaces(blocks, PROSE[format], keysOf(count));
        const typed = await measureTyping(page, places, intervalMs);
        return [...typed, inputBlocks(d.blocks)];
      } finally {
        await demo.stop();
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
      const d = documentOfPages({
        format: "screenplay",
        pages: 20,
        seed: 1,
        sections: "even",
      });
      const html = fiftyPagesHtml();
      const demo = await startBenchDemo();
      try {
        const { page } = await demo.openPage({ userId: "you" });
        const samples: number[] = [];
        for (let n = 0; n < PASTES; n++) {
          await openScript(page, "screenplay", d.doc, d.blocks);
          await caretAt(page, corpusId(d.blocks - 1), "end");
          samples.push(await pasteToPaintMs(page, html));
        }
        return [{ metric: "paste_paint", unit: "ms", samples }];
      } finally {
        await demo.stop();
      }
    },
  };
}
