// Wire payload decoding and patch application for the prompter feed.
import type { BlockJSON } from "@manent/schema";
import type {
  PrompterFeed,
  PrompterPatch,
  PrompterRow,
  PrompterStory,
} from "@manent/sync-protocol";
import { readBlocks } from "../view/view.ts";

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // bytes that are not JSON are no payload: the reader refuses them like any other wrong shape
    return null;
  }
}

type NullableNumber = { ok: true; value: number | null } | { ok: false };

function readNullableNumber(value: unknown): NullableNumber {
  if (value === null) return { ok: true, value: null };
  return typeof value === "number" && Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false };
}

function readPrompterRow(value: unknown): PrompterRow | null {
  if (!isFields(value)) return null;
  const { rowId, kind, title, storyId } = value;
  if (typeof rowId !== "string" || typeof title !== "string") return null;
  if (kind !== "story" && kind !== "header") return null;
  if (storyId !== null && typeof storyId !== "string") return null;
  const rowNumber = readNullableNumber(value.number);
  const durationMs = readNullableNumber(value.durationMs);
  if (!rowNumber.ok || !durationMs.ok) return null;
  return {
    rowId,
    kind,
    number: rowNumber.value,
    title,
    storyId,
    durationMs: durationMs.value,
  };
}

function readRunOrder(value: unknown): PrompterRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: PrompterRow[] = [];
  for (const item of value) {
    const row = readPrompterRow(item);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

function readPrompterStory(value: unknown): PrompterStory | null {
  if (!isFields(value) || typeof value.storyId !== "string") return null;
  const blocks = readBlocks(value.blocks);
  return blocks === null ? null : { storyId: value.storyId, blocks };
}

function readPrompterStories(value: unknown): PrompterStory[] | null {
  if (!Array.isArray(value)) return null;
  const stories: PrompterStory[] = [];
  for (const item of value) {
    const story = readPrompterStory(item);
    if (story === null) return null;
    stories.push(story);
  }
  return stories;
}

/** Null for anything but a version 1 prompter snapshot whose rows and story blocks have their shape. */
export function readPrompterFeed(bytes: Uint8Array): PrompterFeed | null {
  const value = readJson(bytes);
  if (!isFields(value) || value.v !== 1) return null;
  const runOrder = readRunOrder(value.runOrder);
  const stories = readPrompterStories(value.stories);
  if (runOrder === null || stories === null) return null;
  return { v: 1, runOrder, stories };
}

/** Null for anything but a version 1 prompter patch whose fields all have their shape. */
export function readPrompterPatch(bytes: Uint8Array): PrompterPatch | null {
  const value = readJson(bytes);
  if (!isFields(value) || value.v !== 1) return null;
  const runOrder =
    value.runOrder === null ? null : readRunOrder(value.runOrder);
  if (value.runOrder !== null && runOrder === null) return null;
  const stories = readPrompterStories(value.stories);
  if (stories === null || !Array.isArray(value.removed)) return null;
  const removed: string[] = [];
  for (const item of value.removed) {
    if (typeof item !== "string") return null;
    removed.push(item);
  }
  return { v: 1, runOrder, stories, removed };
}

/** Keyed by each story entry's `storyId` as the server sent it. */
export function storiesFromFeed(
  feed: PrompterFeed,
): ReadonlyMap<string, readonly BlockJSON[]> {
  const map = new Map<string, readonly BlockJSON[]>();
  for (const story of feed.stories) map.set(story.storyId, story.blocks);
  return map;
}

/** Removals first, then replaced stories; returns `stories` unchanged when the patch touches neither. */
export function applyPrompterPatch(
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
  patch: PrompterPatch,
): ReadonlyMap<string, readonly BlockJSON[]> {
  if (patch.removed.length === 0 && patch.stories.length === 0) return stories;
  const next = new Map<string, readonly BlockJSON[]>(stories);
  for (const id of patch.removed) next.delete(id);
  for (const story of patch.stories) next.set(story.storyId, story.blocks);
  return next;
}
