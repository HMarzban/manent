// Salt: White locked by Priya, then Dana's Blue pages after Leo's note, ready to issue and not issued.
import { scriptBody } from "@manent/crdt";
import { SALT_LINES } from "../../content/medium/harbour-lights.ts";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { HARBOUR_LIGHTS_GUIDE } from "../../generate/banks/medium/harbour-lights.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import { fitAPages, intentsOf, unitsIn } from "../../generate/fit.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedSession } from "../driver.ts";
import type { SeedContext } from "../seed.ts";
import {
  applyBlockChanges,
  assertWritten,
  generateScript,
  indicesOf,
  sceneStart,
  toPages,
  unlockedLayout,
  usedNear,
} from "../story.ts";
import type { Story, WrittenScript } from "../story.ts";

const KEY = "medium/harbour-lights/202";
const GUIDE = HARBOUR_LIGHTS_GUIDE;
const WHERE = `${GUIDE.project}: 202`;
const PAGES = 56;

// the block a passage is written after on a page: past its opening heading, or the unit that starts it
function afterFirst(blocks: readonly SeedBlock[], at: number): number {
  if (blocks[at]?.element === "scene_heading") return at + 1;
  const [unit] = unitsIn(blocks, at, blocks.length, {
    intentOf: intentsOf(GUIDE),
    movable: () => true,
  });
  return unit?.from === at ? unit.to : at + 1;
}

/** The part of `passage` from `from` to `to`, with the marks it carries. */
function partOf(passage: SeedPassage, from: number, to: number): SeedPassage {
  return {
    blocks: passage.blocks.slice(from, to),
    pageStarts: [],
    numbers: [],
    marked: passage.marked.flatMap((i) =>
      i >= from && i < to ? [i - from] : [],
    ),
    omitted: [],
  };
}

/**
 * Plans 202's history: Dana writes it, Priya locks its White pages, and Dana's Blue changes follow
 * Leo's note: the unpaid fish bill on page 12, whose run then fills 12 and 12A; scene 19 omitted;
 * the bank's figures on page 27 and the bill's callback on page 31, each kept to its page.
 */
export async function planSalt(
  context: SeedContext,
  story: Story,
  meter: PageMeter,
  plan: (at: string, run: () => Promise<void>) => void,
): Promise<void> {
  const { rng, ids } = context;
  const layout = unlockedLayout(GUIDE);
  const generated = generateScript(GUIDE, KEY, rng);
  const white = await toPages(generated, PAGES, {
    fixed: new Set(),
    guide: GUIDE,
    rng,
    meter,
    layout,
  });
  const script: WrittenScript = { blocks: [], ids: [] };
  const writing = sessionsBetween([], white, 3);
  for (const [i, at] of ["D−17 10:20", "D−16 10:05", "D−15 10:40"].entries())
    plan(at, () =>
      story.sessionWith("dana", KEY, (session) =>
        applyBlockChanges(session, script, writing[i]!, ids),
      ),
    );
  plan("D−10 10:30", () => story.lock("priya", KEY));

  const salt = parseSeedText(SALT_LINES);
  // the fish bill, the bank's figures, and the callback that gets the bill wrong
  const nora = partOf(salt, 0, 8);
  const brack = partOf(salt, 8, 13);
  const callback = partOf(salt, 13, 18);
  const fixed = new Set(salt.blocks);
  // the blocks from page `label`'s start to the next page's, by the lock's anchors once it is locked (they
  // name the server's blocks), else as the meter lays the script out
  const pageRun = async (
    label: string,
  ): Promise<{ start: number; end: number; locked: boolean }> => {
    const production = context.driver?.production ?? null;
    const anchors =
      production === null
        ? []
        : (await production.state("dana", seedDoc(KEY).docId)).anchors
            .filter((a) => a.level === 1)
            .toSorted((a, b) => a.order - b.order);
    const starts =
      anchors.length > 0
        ? anchors.map((a) => ({
            label: a.label,
            blockIndex: script.ids.indexOf(a.blockId),
          }))
        : await meter.pages(script.blocks, layout);
    const page = starts.findIndex((p) => p.label === label);
    if (page === -1 || starts[page]!.blockIndex === -1)
      throw new SeedBuildError("unfit", `${WHERE}: page ${label}`);
    const next = starts[page + 1]?.blockIndex ?? script.blocks.length;
    const start = starts[page]!.blockIndex;
    return { start, end: next, locked: anchors.length > 0 };
  };
  // `blocks` written on page `label`, after `after` or else after the page's first unit; then, once the script
  // is locked and `labels` are given, that page's run fitted to them, measured on its own as the lock lays it out
  const writeOnPage = async (
    session: SeedSession,
    blocks: readonly SeedBlock[],
    on: {
      label: string;
      labels: readonly string[] | null;
      after: SeedBlock | null;
    },
  ): Promise<void> => {
    const run = await pageRun(on.label);
    const at =
      on.after === null
        ? afterFirst(script.blocks, run.start)
        : script.blocks.indexOf(on.after) + 1;
    const written = [
      ...script.blocks.slice(run.start, at),
      ...blocks,
      ...script.blocks.slice(at, run.end),
    ];
    const fitted =
      !run.locked || on.labels === null
        ? written
        : await fitAPages(
            written,
            {
              firstBlock: 0,
              lastBlock: written.length - 1,
              labels: on.labels.map((_, i) => String(i + 1)),
            },
            {
              meter,
              layout,
              guide: GUIDE,
              rng,
              used: usedNear(script.blocks, run.start, PAGES),
              fixed: indicesOf(written, fixed),
            },
          );
    const doc = [
      ...script.blocks.slice(0, run.start),
      ...fitted,
      ...script.blocks.slice(run.end),
    ];
    const [changes] = sessionsBetween(script.blocks, doc, 1);
    await applyBlockChanges(session, script, changes!, ids);
  };
  plan("D−6 10:40", () =>
    story.sessionWith("dana", KEY, (session) =>
      writeOnPage(session, nora.blocks.slice(0, 5), {
        label: "12",
        labels: null,
        after: null,
      }),
    ),
  );
  plan("D−6 11:25", () =>
    story.sessionWith("dana", KEY, (session) =>
      writeOnPage(session, nora.blocks.slice(5), {
        label: "12",
        labels: ["12", "12A"],
        after: nora.blocks[4]!,
      }),
    ),
  );
  plan("D−5 11:10", () =>
    story.sessionWith("dana", KEY, async (session) => {
      const heading = script.ids[sceneStart(script.blocks, 19)]!;
      await session.change((doc) =>
        scriptBody(doc).write((writer) => {
          writer.setBlockAttrs(heading, { omitted: true });
        }),
      );
    }),
  );
  plan("D−3 10:50", () =>
    story.sessionWith("dana", KEY, async (session) => {
      await writeOnPage(session, brack.blocks, {
        label: "27",
        labels: ["27"],
        after: null,
      });
      await writeOnPage(session, callback.blocks, {
        label: "31",
        labels: ["31"],
        after: null,
      });
    }),
  );
  plan("D−3 10:50", async () => {
    // without production nothing was locked, so no line carries a revision mark to check
    if ((context.driver?.production ?? null) === null) return;
    for (const part of [nora, brack, callback]) {
      const first = script.ids[script.blocks.indexOf(part.blocks[0]!)]!;
      await assertWritten(context, KEY, part, first, `${WHERE} Blue`);
    }
  });
}
