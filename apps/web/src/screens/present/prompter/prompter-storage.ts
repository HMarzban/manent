// Guarded persistence for the prompter window's own view state and each rundown's last received feed.
import type { BlockJSON, TextJSON } from "@manent/schema";
import type { PrompterRow, PrompterStory } from "@manent/sync-protocol";

export const PROMPTER_TEXT_SIZES = [32, 40, 48, 64, 80] as const;
export type PrompterTextSize = (typeof PROMPTER_TEXT_SIZES)[number];

export const DEFAULT_PROMPTER_VIEW: PrompterViewState = Object.freeze({
  v: 1,
  textSize: 48,
  dark: true,
  mirror: false,
});

export interface PrompterViewState {
  readonly v: 1;
  readonly textSize: PrompterTextSize;
  readonly dark: boolean;
  readonly mirror: boolean;
}

export interface CachedPrompterFeed {
  readonly v: 1;
  readonly runOrder: readonly PrompterRow[];
  readonly stories: readonly PrompterStory[];
  readonly lastReceivedAt: number | null;
}

const VIEW_KEY = "manent.prompter.view";
const feedKey = (rundownId: string): string =>
  `manent.prompter.feed.${rundownId}`;

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextSize(value: unknown): value is PrompterTextSize {
  return (
    typeof value === "number" &&
    PROMPTER_TEXT_SIZES.some((size) => size === value)
  );
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readJson(storage: Storage | null, key: string): unknown {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // storage unavailable or unreadable JSON: fall back to defaults or empty cache
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (storage === null) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: state lasts for this session
  }
}

function readTextRun(value: unknown): TextJSON | null {
  if (!isFields(value) || value.type !== "text") return null;
  return typeof value.text === "string"
    ? { type: "text", text: value.text }
    : null;
}

function readBlock(value: unknown): BlockJSON | null {
  if (!isFields(value) || value.type !== "block") return null;
  let attrs: BlockJSON["attrs"];
  if (value.attrs !== undefined) {
    if (!isFields(value.attrs)) return null;
    attrs = { ...value.attrs };
  }
  let content: TextJSON[] | undefined;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return null;
    content = [];
    for (const item of value.content) {
      const run = readTextRun(item);
      if (run === null) return null;
      content.push(run);
    }
  }
  return {
    type: "block",
    ...(attrs === undefined ? {} : { attrs }),
    ...(content === undefined ? {} : { content }),
  };
}

function readRow(value: unknown): PrompterRow | null {
  if (!isFields(value)) return null;
  const { rowId, kind, title, storyId } = value;
  if (typeof rowId !== "string" || typeof title !== "string") return null;
  if (kind !== "story" && kind !== "header") return null;
  if (storyId !== null && typeof storyId !== "string") return null;
  const rowNumber = readNullableNumber(value.number);
  const durationMs = readNullableNumber(value.durationMs);
  if (rowNumber === undefined || durationMs === undefined) return null;
  return { rowId, kind, number: rowNumber, title, storyId, durationMs };
}

function readStory(value: unknown): PrompterStory | null {
  if (
    !isFields(value) ||
    typeof value.storyId !== "string" ||
    !Array.isArray(value.blocks)
  )
    return null;
  const blocks: BlockJSON[] = [];
  for (const item of value.blocks) {
    const block = readBlock(item);
    if (block === null) return null;
    blocks.push(block);
  }
  return { storyId: value.storyId, blocks };
}

/** Reads the prompter window's own view state; returns defaults when absent, corrupted or storage is unavailable. */
export function readPrompterView(storage: Storage | null): PrompterViewState {
  const value = readJson(storage, VIEW_KEY);
  if (!isFields(value) || value.v !== 1) return DEFAULT_PROMPTER_VIEW;
  return {
    v: 1,
    textSize: isTextSize(value.textSize)
      ? value.textSize
      : DEFAULT_PROMPTER_VIEW.textSize,
    dark:
      typeof value.dark === "boolean" ? value.dark : DEFAULT_PROMPTER_VIEW.dark,
    mirror:
      typeof value.mirror === "boolean"
        ? value.mirror
        : DEFAULT_PROMPTER_VIEW.mirror,
  };
}

/** Writes the prompter window's own view state under `manent.prompter.view`; ignores storage failures. */
export function writePrompterView(
  storage: Storage | null,
  view: PrompterViewState,
): void {
  writeJson(storage, VIEW_KEY, view);
}

/** Reads the last received prompter feed for `rundownId`; returns null when none is kept or unreadable. */
export function readCachedFeed(
  storage: Storage | null,
  rundownId: string,
): CachedPrompterFeed | null {
  const value = readJson(storage, feedKey(rundownId));
  if (!isFields(value) || value.v !== 1) return null;
  if (!Array.isArray(value.runOrder) || !Array.isArray(value.stories))
    return null;
  const lastReceivedAt = readNullableNumber(value.lastReceivedAt);
  if (lastReceivedAt === undefined) return null;
  const runOrder: PrompterRow[] = [];
  for (const item of value.runOrder) {
    const row = readRow(item);
    if (row === null) return null;
    runOrder.push(row);
  }
  const stories: PrompterStory[] = [];
  for (const item of value.stories) {
    const story = readStory(item);
    if (story === null) return null;
    stories.push(story);
  }
  return { v: 1, runOrder, stories, lastReceivedAt };
}

/** Writes the last received prompter feed for `rundownId` under `manent.prompter.feed.<rundownId>`. */
export function writeCachedFeed(
  storage: Storage | null,
  rundownId: string,
  feed: CachedPrompterFeed,
): void {
  writeJson(storage, feedKey(rundownId), feed);
}

/** Converts cached story entries into the map shape the reading view consumes. */
export function storiesToMap(
  stories: readonly PrompterStory[],
): ReadonlyMap<string, readonly BlockJSON[]> {
  const map = new Map<string, readonly BlockJSON[]>();
  for (const story of stories) map.set(story.storyId, story.blocks);
  return map;
}

/** Converts a live story map into serialisable entries for storage. */
export function mapToStories(
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
): PrompterStory[] {
  return [...stories.entries()].map(([storyId, blocks]) => ({
    storyId,
    blocks: [...blocks],
  }));
}
