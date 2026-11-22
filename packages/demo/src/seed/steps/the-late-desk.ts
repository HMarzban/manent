// The Late Desk: today's Monologue as Sam wrote it through the vote, and the show's other scripted segments; and
// the helpers every story of the Writers' room is told with.
import { scriptBody } from "@manent/crdt";
import { projectHome } from "@manent/sync-protocol";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import {
  MONOLOGUE,
  MONOLOGUE_TOLLE_EARLY,
  MONOLOGUE_TOLLE_FIRST_COUNT,
} from "../../content/medium/the-late-desk.ts";
import { LATE_DESK_GUIDE } from "../../generate/banks/medium/the-late-desk.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import type { VarietyStory } from "../../generate/guide.ts";
import { SEED_DOCS, seedDoc, seedProject } from "../catalogue.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver, SeedSession } from "../driver.ts";
import type { SeedContext, SeedEntry, SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";
import type { Story } from "../story.ts";

/** A step's story with the driver it is told through. */
export interface Telling {
  context: SeedContext;
  driver: SeedDriver;
  story: Story;
}

/** One action of a step's story, at a time in the seed's notation. */
export interface StoryEvent {
  at: string;
  run(): Promise<void>;
}

/** A document's blocks as the person replaying it holds them, with their ids, in document order. */
export interface Replica {
  ids: string[];
  blocks: SeedBlock[];
}

/** The project's one entry in the manifest: its title and how many documents it holds. */
export function projectEntry(projectKey: string): SeedEntry[] {
  const documents = SEED_DOCS.filter((d) => d.projectKey === projectKey);
  return [
    { project: seedProject(projectKey).title, documents: documents.length },
  ];
}

/** Runs `events` in the order of their times, those at one time in the order given. */
export async function runInOrder(
  telling: Telling,
  events: readonly StoryEvent[],
): Promise<void> {
  const { time } = telling.context;
  const timed = events.map((event) => ({ event, at: time.at(event.at) }));
  for (const { event } of timed.toSorted((a, b) => a.at - b.at)) {
    await telling.story.at(event.at);
    await event.run();
  }
}

/**
 * At `at`, `userId` creates the document `key` in its project's home, lists it in the workspace's index (with
 * its project when `withProject`), and writes it in one session that starts by setting its format.
 */
export async function createDocument(
  telling: Telling,
  doc: { key: string; userId: string; at: string; withProject: boolean },
  write: (session: SeedSession) => Promise<void>,
): Promise<void> {
  const { context, driver, story } = telling;
  const found = seedDoc(doc.key);
  const project = seedProject(found.projectKey);
  const { workspaceId } = project;
  await driver.create(doc.userId, {
    docId: found.docId,
    kind: found.kind,
    home: projectHome(project.projectId),
    workspaceId,
  });
  await driver.index(doc.userId, workspaceId, {
    projects: doc.withProject ? [project] : [],
    documents: [found],
    at: context.time.at(doc.at),
  });
  await story.sessionWith(doc.userId, doc.key, async (session) => {
    if (found.format !== "screenplay")
      await setting(telling, session, "script.format", found.format);
    await write(session);
  });
}

/** Sets a script setting in the session; skipped without "settings", and SeedDriverError "refused" when refused. */
export async function setting(
  telling: Telling,
  session: SeedSession,
  key: string,
  value: unknown,
): Promise<void> {
  if (!telling.driver.capabilities.has("settings")) {
    telling.context.skip("settings", `set ${key}`);
    return;
  }
  if ((await session.set(key, value)) === "refused")
    throw new SeedDriverError("refused", `the setting ${key} was refused`);
}

/** Writes `blocks` after the replica's last block (at the start of an empty one), and adds them to it. */
export async function append(
  telling: Telling,
  session: SeedSession,
  replica: Replica,
  blocks: readonly SeedBlock[],
): Promise<void> {
  const after = replica.ids.at(-1) ?? null;
  const ids = await telling.story.write(
    session,
    blocks,
    after,
    telling.context.ids,
  );
  replica.ids.push(...ids);
  replica.blocks.push(...blocks);
}

/** Rewrites the plain text of block `at` to `text`, changing only the run between what both share at each end. */
export async function rewrite(
  session: SeedSession,
  replica: Replica,
  at: number,
  text: string,
): Promise<void> {
  const id = replica.ids[at]!;
  const was = replica.blocks[at]!;
  const from = was.text;
  let start = 0;
  while (start < from.length && from[start] === text[start]) start += 1;
  let end = 0;
  while (
    end < from.length - start &&
    end < text.length - start &&
    from[from.length - 1 - end] === text[text.length - 1 - end]
  )
    end += 1;
  await session.change((doc) =>
    scriptBody(doc).write((writer) => {
      writer.deleteText(id, start, from.length - start - end);
      writer.insertText(id, start, text.slice(start, text.length - end));
    }),
  );
  replica.blocks[at] = { ...was, text };
}

/** Checks each written passage against the server's pages, numbers and marks; SeedBuildError "rules_broken" on any disagreement. */
export async function checkPassages(
  telling: Telling,
  where: string,
  written: readonly {
    key: string;
    passage: SeedPassage;
    firstBlockId: string;
  }[],
): Promise<void> {
  for (const { key, passage, firstBlockId } of written) {
    const found = await telling.driver.check(
      seedDoc(key).docId,
      passage,
      firstBlockId,
    );
    if (found.length > 0)
      throw new SeedBuildError("rules_broken", `${where}: ${found.join("; ")}`);
  }
}

/** A block of plain text. */
export const block = (
  element: SeedBlock["element"],
  text: string,
): SeedBlock => ({
  element,
  text,
  marks: [],
  kind: null,
});

/** A cue as the fixed scripts write one: what it shows, then its running time ("[THE BAND PLAYS T=0:06]"). */
function cueOf(bracket: string): string {
  const [time = "", ...what] = bracket.split(" ");
  return `[${what.join(" ").toUpperCase()} ${time}]`;
}

/**
 * A row's script: its title as the slug, each line under its speaker's cue, and its cues spread through the
 * lines, cue k before line ⌊k × lines / cues⌋, so the first cue opens the script.
 */
export function storyBlocks(story: VarietyStory, title: string): SeedBlock[] {
  const blocks = [block("slug", title.toUpperCase())];
  const { lines, brackets } = story;
  for (const [i, line] of lines.entries()) {
    for (const [k, bracket] of brackets.entries())
      if (Math.floor((k * lines.length) / brackets.length) === i)
        blocks.push(block("bracket", cueOf(bracket)));
    if (line.speaker !== null) blocks.push(block("character", line.speaker));
    blocks.push(block("dialogue", line.text));
  }
  return blocks;
}

const MONOLOGUE_KEY = "medium/the-late-desk/monologue";
const PROJECT_KEY = "medium/the-late-desk";

// the show's other scripted rows in rundown order, and who wrote each
const SEGMENT_WRITERS: readonly (readonly [string, string])[] = [
  ["segments/1", "dana"],
  ["segments/4", "sam"],
  ["segments/5", "ana"],
  ["segments/7", "dana"],
  ["segments/9", "sam"],
  ["segments/10", "ana"],
  ["segments/12", "ana"],
  ["segments/14", "dana"],
  ["segments/16", "dana"],
];
// the segments are written from N−8:00 to N−2:00, one every 45 minutes
const SEGMENT_START_MINUTES = 480;
const SEGMENT_GAP_MINUTES = 45;

/** `minutes` before N in the seed's notation ("N−7:15"). */
export function beforeNow(minutes: number): string {
  const mm = String(minutes % 60).padStart(2, "0");
  return `N−${Math.floor(minutes / 60)}:${mm}`;
}

// the vote joke as it read after the first report: the final joke's lead, then the first count in place of its "…"
function firstCount(final: string): string {
  const count = parseSeedText(MONOLOGUE_TOLLE_FIRST_COUNT).blocks[0]!.text;
  return final.slice(0, final.indexOf("Thirty-one")) + count.replace(/^…/, "");
}

function monologueEvents(telling: Telling, replica: Replica): StoryEvent[] {
  const final = parseSeedText(MONOLOGUE).blocks;
  const tolle = final.findIndex((b) =>
    b.text.includes("Tolle Exchange into a library"),
  );
  const ferry = final.findIndex((b) => b.text.includes("last ferry to Wrenna"));
  const early = final.map((b, i) => {
    if (i === tolle) return parseSeedText(MONOLOGUE_TOLLE_EARLY).blocks[0]!;
    if (i === ferry)
      return { ...b, text: b.text.replace("left at eight", "goes at nine") };
    return b;
  });
  const later = (fn: (session: SeedSession) => Promise<void>) =>
    telling.story.sessionWith("sam", MONOLOGUE_KEY, fn);
  const created = {
    key: MONOLOGUE_KEY,
    userId: "sam",
    at: "N−8:30",
    withProject: true,
  };
  return [
    {
      at: created.at,
      run: () =>
        createDocument(telling, created, (session) =>
          append(telling, session, replica, early.slice(0, 1)),
        ),
    },
    {
      at: "N−7:55",
      run: () =>
        later((session) => append(telling, session, replica, early.slice(1))),
    },
    {
      at: "N−2:20",
      run: () =>
        later((session) =>
          rewrite(session, replica, tolle, firstCount(final[tolle]!.text)),
        ),
    },
    {
      at: "N−0:38",
      run: () =>
        later(async (session) => {
          await rewrite(session, replica, tolle, final[tolle]!.text);
          await rewrite(session, replica, ferry, final[ferry]!.text);
        }),
    },
  ];
}

/** The guide's script for the row `slug`; RangeError when the guide has none. */
function storyOf(stories: readonly VarietyStory[], slug: string): VarietyStory {
  const found = stories.find((story) => story.slug === slug);
  if (found === undefined)
    throw new RangeError(`no script is written for ${slug}`);
  return found;
}

function segmentEvents(telling: Telling): StoryEvent[] {
  return SEGMENT_WRITERS.map(([slug, userId], i) => {
    const key = `${PROJECT_KEY}/${slug}`;
    const at = beforeNow(SEGMENT_START_MINUTES - i * SEGMENT_GAP_MINUTES);
    const blocks = storyBlocks(
      storyOf(LATE_DESK_GUIDE.stories, slug),
      seedDoc(key).title,
    );
    return {
      at,
      run: () =>
        createDocument(
          telling,
          { key, userId, at, withProject: false },
          (session) =>
            append(telling, session, { ids: [], blocks: [] }, blocks),
        ),
    };
  });
}

async function tellLateDesk(telling: Telling): Promise<void> {
  const monologue: Replica = { ids: [], blocks: [] };
  await runInOrder(telling, [
    ...monologueEvents(telling, monologue),
    ...segmentEvents(telling),
  ]);
  await checkPassages(telling, LATE_DESK_GUIDE.project, [
    {
      key: MONOLOGUE_KEY,
      passage: parseSeedText(MONOLOGUE),
      firstBlockId: monologue.ids[0]!,
    },
  ]);
}

export const THE_LATE_DESK: SeedStep = {
  id: "the-late-desk",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver !== null)
      await tellLateDesk({
        context,
        driver,
        story: createStory(context, "the-late-desk"),
      });
    return projectEntry(PROJECT_KEY);
  },
};
