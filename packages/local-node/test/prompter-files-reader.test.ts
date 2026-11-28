import { afterAll, expect, test } from "bun:test";
import { formatPrompterStory } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { Clock } from "@manent/sync-client";
import type { PrompterRow } from "@manent/sync-protocol";
import { createTempTrees, startPrompterFolderReader } from "@manent/testkit";
import {
  createPrompterFilesWriter,
  formatRunOrderDuration,
} from "../src/index.ts";
import type { PrompterFeed, PrompterFeedSnapshot } from "../src/index.ts";

const trees = createTempTrees("manent-prompter-reader-");
afterAll(trees.removeAll);

const RUNDOWN_ID = "11111111-1111-4111-8111-111111111111";
const CHANGES = 300;
const CRLF = "\r\n";

interface StorySpec {
  readonly rowId: string;
  readonly number: number;
  readonly title: string;
  readonly fileName: string;
  readonly bodyFiller: string;
}

const STORY_SPECS: readonly StorySpec[] = [
  {
    rowId: "r-short",
    number: 1,
    title: "Short story",
    fileName: "01-short-story.txt",
    bodyFiller: "Brief cue line.",
  },
  {
    rowId: "r-medium",
    number: 2,
    title: "Medium story",
    fileName: "02-medium-story.txt",
    bodyFiller: "Broadcast desk update keeps every line aligned. ".repeat(320),
  },
  {
    rowId: "r-long",
    number: 3,
    title: "Long story",
    fileName: "03-long-story.txt",
    bodyFiller:
      "Extended bulletin transcript carries full anchor copy. ".repeat(6_000),
  },
];

function createRealClock(): Clock {
  return {
    now: () => Date.now(),
    schedule(fn, delayMs) {
      const id = setTimeout(fn, delayMs);
      return () => clearTimeout(id);
    },
  };
}

function createFakeFeed(initial: PrompterFeedSnapshot): {
  feed: PrompterFeed;
  push(next: PrompterFeedSnapshot): void;
} {
  let current: PrompterFeedSnapshot | null = initial;
  const listeners = new Set<() => void>();
  return {
    feed: {
      current: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    push(next) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

function buildStoryBlocks(spec: StorySpec, version: number): BlockJSON[] {
  const tag = `v${String(version).padStart(4, "0")}`;
  return [
    {
      type: "block",
      attrs: { id: `${spec.rowId}-ch`, type: "character" },
      content: [{ type: "text", text: `Anchor ${tag}` }],
    },
    {
      type: "block",
      attrs: { id: `${spec.rowId}-body`, type: "dialogue" },
      content: [
        {
          type: "text",
          text: `Start ${tag} ${spec.bodyFiller} End ${tag}.`,
        },
      ],
    },
  ];
}

function toCrlf(text: string): string {
  return text === "" ? "" : `${text.replace(/\r?\n/g, CRLF)}${CRLF}`;
}

function buildSnapshot(version: number): {
  snapshot: PrompterFeedSnapshot;
  expected: Map<string, string>;
} {
  const runOrder: PrompterRow[] = [];
  const stories = new Map<string, readonly BlockJSON[]>();
  const expected = new Map<string, string>();
  const orderLines: string[] = [];

  for (const spec of STORY_SPECS) {
    const durationMs = (spec.number * 30 + version) * 1_000;
    runOrder.push({
      rowId: spec.rowId,
      kind: "story",
      number: spec.number,
      title: spec.title,
      storyId: `doc-${spec.rowId}`,
      durationMs,
    });
    const blocks = buildStoryBlocks(spec, version);
    stories.set(spec.rowId, blocks);
    expected.set(spec.fileName, toCrlf(formatPrompterStory(blocks)));
    orderLines.push(
      `${spec.number}\t${spec.title}\t${spec.fileName}\t${formatRunOrderDuration(durationMs)}${CRLF}`,
    );
  }
  expected.set("run-order.txt", orderLines.join(""));

  return { snapshot: { runOrder, stories }, expected };
}

function recordExpected(
  writtenByFile: Map<string, Set<string>>,
  expected: ReadonlyMap<string, string>,
): void {
  for (const [name, content] of expected) {
    let set = writtenByFile.get(name);
    if (set === undefined) {
      set = new Set<string>();
      writtenByFile.set(name, set);
    }
    set.add(content);
  }
}

test("a reader polling the folder never sees half a prompter file", async () => {
  const folder = await trees.tree({});
  const writtenByFile = new Map<string, Set<string>>();
  const snapshots: Array<{
    snapshot: PrompterFeedSnapshot;
    expected: Map<string, string>;
  }> = [];

  for (let step = 0; step <= CHANGES; step += 1) {
    const built = buildSnapshot(step);
    recordExpected(writtenByFile, built.expected);
    snapshots.push(built);
  }

  const initial = snapshots[0];
  if (initial === undefined) throw new Error("Missing initial snapshot");

  const source = createFakeFeed(initial.snapshot);
  const reader = startPrompterFolderReader(folder);

  let writer: { stop(): void } | undefined;
  try {
    await reader.ready;

    writer = createPrompterFilesWriter({
      rundownId: RUNDOWN_ID,
      folder,
      encoding: "utf-8",
      feed: source.feed,
      clock: createRealClock(),
      onStatus: () => {},
    });

    for (let step = 1; step < snapshots.length; step += 1) {
      const next = snapshots[step];
      if (next !== undefined) source.push(next.snapshot);
    }

    writer.stop();
    writer = undefined;

    const result = await reader.stop();

    expect(result.totalReads).toBeGreaterThan(0);

    const expectedNames = [
      "run-order.txt",
      ...STORY_SPECS.map((spec) => spec.fileName),
    ];
    for (const name of expectedNames) {
      const observations = result.files[name] ?? [];
      const count = observations.reduce((sum, entry) => sum + entry.count, 0);
      expect(count).toBeGreaterThan(0);
    }

    const unexpected: Array<{
      name: string;
      length: number;
      head: string;
      tail: string;
    }> = [];
    for (const [name, observations] of Object.entries(result.files)) {
      const allowed = writtenByFile.get(name);
      for (const { content } of observations) {
        if (allowed === undefined || !allowed.has(content)) {
          unexpected.push({
            name,
            length: content.length,
            head: content.slice(0, 60),
            tail: content.slice(-30),
          });
        }
      }
    }

    expect(unexpected).toEqual([]);
  } finally {
    writer?.stop();
    reader.kill();
  }
}, 60_000);
