// PrompterFeed -> MOS Running Order projection (strictly ADR 0050) and minimal incremental RO diff.
import { prompterBlocks } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type {
  MosDialect,
  MosEnvelope,
  MosMessage,
  MosRoStorySendMessage,
  MosStoryHeader,
} from "./messages.ts";

/** Structurally compatible with `@manent/sync-protocol`'s `PrompterRow`. */
export interface MosPrompterRow {
  readonly rowId: string;
  readonly kind: "story" | "header";
  readonly number: number | null;
  readonly title: string;
  readonly storyId: string | null;
  readonly durationMs: number | null;
}

/** Structurally compatible with `@manent/sync-protocol`'s `PrompterStory`. */
export interface MosPrompterStory {
  readonly storyId: string;
  readonly blocks: readonly BlockJSON[];
}

/** Structurally compatible with `@manent/sync-protocol`'s `PrompterFeed`. */
export interface MosPrompterFeed {
  readonly v: 1;
  readonly runOrder: readonly MosPrompterRow[];
  readonly stories: readonly MosPrompterStory[];
}

export interface MosRunningOrderStory {
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum: string | null;
  readonly paragraphs: readonly string[];
  readonly presenter: string | null;
  readonly durationMs: number | null;
}

export interface MosRunningOrder {
  readonly roId: string;
  readonly roSlug: string;
  readonly stories: readonly MosRunningOrderStory[];
}

export interface MosDiffContext {
  readonly mosId: string;
  readonly ncsId: string;
  readonly dialect: MosDialect;
  readonly nextMessageId?: () => number;
}

const blockText = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

function storySlugOf(row: MosPrompterRow): string {
  if (row.number === null) return row.title;
  return row.title === "" ? String(row.number) : `${row.number}  ${row.title}`;
}

/**
 * Projects a `PrompterFeed` into a MOS running order strictly through ADR 0050 (`prompterBlocks`):
 * headers and unsent story rows are omitted, and only spoken blocks enter `<storyBody>`.
 */
export function projectPrompterFeedToMos(
  roId: string,
  roSlug: string,
  feed: MosPrompterFeed,
): MosRunningOrder {
  const storyMap = new Map<string, readonly BlockJSON[]>();
  for (const entry of feed.stories) storyMap.set(entry.storyId, entry.blocks);

  const stories: MosRunningOrderStory[] = [];
  for (const row of feed.runOrder) {
    if (row.kind !== "story") continue;
    const raw =
      storyMap.get(row.rowId) ??
      (row.storyId !== null ? storyMap.get(row.storyId) : undefined);
    if (raw === undefined) continue;
    const spoken = prompterBlocks(raw);
    const paragraphs: string[] = [];
    let presenter: string | null = null;
    for (const block of spoken) {
      const text = blockText(block);
      if (block.attrs?.type === "character") {
        const upper = text.toUpperCase();
        if (presenter === null && upper.trim() !== "") presenter = upper;
        paragraphs.push(upper);
      } else {
        paragraphs.push(text);
      }
    }
    stories.push({
      storyId: row.rowId,
      storySlug: storySlugOf(row),
      storyNum: row.number === null ? null : String(row.number),
      paragraphs,
      presenter,
      durationMs: row.durationMs,
    });
  }
  return { roId, roSlug, stories };
}

function envelopeOf(context: MosDiffContext): MosEnvelope {
  const messageId = context.nextMessageId?.();
  return {
    mosId: context.mosId,
    ncsId: context.ncsId,
    ...(messageId !== undefined ? { messageId } : {}),
  };
}

function headerOf(story: MosRunningOrderStory): MosStoryHeader {
  return {
    storyId: story.storyId,
    storySlug: story.storySlug,
    ...(story.storyNum !== null ? { storyNum: story.storyNum } : {}),
  };
}

function storySendOf(
  roId: string,
  story: MosRunningOrderStory,
  context: MosDiffContext,
): MosRoStorySendMessage {
  const winPlus = context.dialect === "autoscript_winplus_ip";
  return {
    ...envelopeOf(context),
    kind: "roStorySend",
    roId,
    storyId: story.storyId,
    storySlug: story.storySlug,
    ...(story.storyNum !== null ? { storyNum: story.storyNum } : {}),
    dialect: context.dialect,
    ...(winPlus && story.presenter !== null
      ? { presenter: story.presenter }
      : {}),
    ...(winPlus && story.durationMs !== null
      ? { durationMs: story.durationMs }
      : {}),
    paragraphs: story.paragraphs,
  };
}

function sameParagraphs(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameStoryHeader(
  a: MosRunningOrderStory,
  b: MosRunningOrderStory,
): boolean {
  return a.storySlug === b.storySlug && a.storyNum === b.storyNum;
}

function sameStoryBody(
  a: MosRunningOrderStory,
  b: MosRunningOrderStory,
  dialect: MosDialect,
): boolean {
  if (!sameParagraphs(a.paragraphs, b.paragraphs)) return false;
  if (dialect === "autoscript_winplus_ip") {
    return a.presenter === b.presenter && a.durationMs === b.durationMs;
  }
  return true;
}

/** Longest increasing subsequence of integer indices, returning the kept index set. */
function lisSet(sequence: readonly number[]): Set<number> {
  const n = sequence.length;
  if (n === 0) return new Set();
  const tails: number[] = [];
  const tailIndices: number[] = [];
  const prev = Array.from({ length: n }, () => -1);

  for (let i = 0; i < n; i += 1) {
    const val = sequence[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (tails[mid]! < val) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = val;
    tailIndices[lo] = i;
    if (lo > 0) prev[i] = tailIndices[lo - 1]!;
  }

  const kept = new Set<number>();
  let cursor = tailIndices.at(-1) ?? -1;
  while (cursor !== -1) {
    kept.add(sequence[cursor]!);
    cursor = prev[cursor]!;
  }
  return kept;
}

/** Computes the minimal MOS message sequence transforming `previous` into `next`. */
export function diffMosRunningOrder(
  previous: MosRunningOrder | null,
  next: MosRunningOrder | null,
  context: MosDiffContext,
): MosMessage[] {
  if (previous === null && next === null) return [];
  if (next === null) {
    return [{ ...envelopeOf(context), kind: "roDelete", roId: previous!.roId }];
  }
  if (
    previous === null ||
    previous.roId !== next.roId ||
    previous.roSlug !== next.roSlug
  ) {
    const out: MosMessage[] = [];
    if (previous !== null && previous.roId !== next.roId) {
      out.push({
        ...envelopeOf(context),
        kind: "roDelete",
        roId: previous.roId,
      });
    }
    out.push({
      ...envelopeOf(context),
      kind: "roCreate",
      roId: next.roId,
      roSlug: next.roSlug,
      dialect: context.dialect,
      stories: next.stories.map(headerOf),
    });
    for (const story of next.stories)
      out.push(storySendOf(next.roId, story, context));
    return out;
  }

  const out: MosMessage[] = [];
  const prevById = new Map(previous.stories.map((s) => [s.storyId, s]));
  const nextById = new Map(next.stories.map((s) => [s.storyId, s]));

  // 1. DELETE stories removed from next
  const deletedIds: string[] = [];
  const surviving: MosRunningOrderStory[] = [];
  for (const story of previous.stories) {
    if (nextById.has(story.storyId)) surviving.push(story);
    else deletedIds.push(story.storyId);
  }
  if (deletedIds.length > 0) {
    out.push({
      ...envelopeOf(context),
      kind: "roElementAction",
      roId: next.roId,
      operation: "DELETE",
      sourceStoryIds: deletedIds,
    });
  }

  // 2. MOVE surviving stories not in LIS to match next's relative order
  const nextSurviving = next.stories.filter((s) => prevById.has(s.storyId));
  const targetRank = new Map<string, number>();
  for (const [rank, story] of nextSurviving.entries())
    targetRank.set(story.storyId, rank);
  const keptRanks = lisSet(surviving.map((s) => targetRank.get(s.storyId)!));
  for (let rank = nextSurviving.length - 1; rank >= 0; rank -= 1) {
    if (keptRanks.has(rank)) continue;
    const story = nextSurviving[rank]!;
    const after = nextSurviving[rank + 1];
    out.push({
      ...envelopeOf(context),
      kind: "roElementAction",
      roId: next.roId,
      operation: "MOVE",
      ...(after !== undefined ? { targetStoryId: after.storyId } : {}),
      sourceStoryIds: [story.storyId],
    });
  }

  // 3. INSERT newly added stories in contiguous runs (right-to-left so targets exist)
  const insertedIds = new Set<string>();
  let idx = next.stories.length - 1;
  while (idx >= 0) {
    if (prevById.has(next.stories[idx]!.storyId)) {
      idx -= 1;
      continue;
    }
    const end = idx;
    while (idx >= 0 && !prevById.has(next.stories[idx]!.storyId)) {
      insertedIds.add(next.stories[idx]!.storyId);
      idx -= 1;
    }
    const run = next.stories.slice(idx + 1, end + 1);
    const after = next.stories[end + 1];
    out.push({
      ...envelopeOf(context),
      kind: "roElementAction",
      roId: next.roId,
      operation: "INSERT",
      ...(after !== undefined ? { targetStoryId: after.storyId } : {}),
      stories: run.map(headerOf),
    });
  }

  // 4. REPLACE changed headers and send bodies via roStorySend
  for (const story of next.stories) {
    if (insertedIds.has(story.storyId)) {
      out.push(storySendOf(next.roId, story, context));
      continue;
    }
    const prior = prevById.get(story.storyId)!;
    const headerChanged = !sameStoryHeader(prior, story);
    if (headerChanged) {
      out.push({
        ...envelopeOf(context),
        kind: "roElementAction",
        roId: next.roId,
        operation: "REPLACE",
        targetStoryId: story.storyId,
        stories: [headerOf(story)],
      });
      out.push(storySendOf(next.roId, story, context));
    } else if (!sameStoryBody(prior, story, context.dialect)) {
      out.push(storySendOf(next.roId, story, context));
    }
  }

  return out;
}

/** Projects `previous` and `next` prompter feeds and returns the minimal MOS diff messages. */
export function diffPrompterFeedToMos(
  previous: MosPrompterFeed | null,
  next: MosPrompterFeed | null,
  options: MosDiffContext & { readonly roId: string; readonly roSlug: string },
): MosMessage[] {
  const prevRo =
    previous === null
      ? null
      : projectPrompterFeedToMos(options.roId, options.roSlug, previous);
  const nextRo =
    next === null
      ? null
      : projectPrompterFeedToMos(options.roId, options.roSlug, next);
  return diffMosRunningOrder(prevRo, nextRo, options);
}
