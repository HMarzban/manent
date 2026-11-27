// Optional desktop LAN MOS 2.8.5 / Autoscript WinPlus-IP relay: streams a PrompterFeed
// over DNS-pinned studio TCP using @manent/server-core's MOS client & strict SSRF allowlist.
import { prompterBlocks } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { createMosTcpClient, resolvePinnedTarget } from "@manent/server-core";
import type {
  DnsLookupFn,
  MosLinkStatus,
  MosTcpClient,
  TargetRefusal,
} from "@manent/server-core";
import type { PrompterRow } from "@manent/sync-protocol";
import type {
  PrompterFeed,
  PrompterFeedSnapshot,
} from "../prompter-files/writer.ts";

type MosOutMessage = Parameters<MosTcpClient["send"]>[0];
export type MosLanDialect = "autoscript_winplus_ip" | "mos_2_8_5";

export interface MosLanRelayConfig {
  readonly rundownId: string;
  readonly roSlug: string;
  readonly host: string;
  readonly upperPort: number;
  readonly mosId: string;
  readonly ncsId: string;
  readonly dialect: MosLanDialect;
  readonly allowedCidrs: readonly string[];
}

export interface MosLanRelayStatus extends MosLanRelayConfig {
  readonly status: MosLinkStatus;
}

interface ProjectedStory {
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum: string | null;
  readonly paragraphs: readonly string[];
  readonly presenter: string | null;
  readonly durationMs: number | null;
  readonly hash: string;
}

const blockText = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

function storySlugOf(row: PrompterRow): string {
  if (row.number === null) return row.title;
  return row.title === "" ? String(row.number) : `${row.number}  ${row.title}`;
}

/** Projects a live `PrompterFeedSnapshot` strictly through ADR 0050 spoken blocks (`prompterBlocks`). */
function projectSnapshot(snapshot: PrompterFeedSnapshot): ProjectedStory[] {
  const out: ProjectedStory[] = [];
  for (const row of snapshot.runOrder) {
    if (row.kind !== "story") continue;
    const raw =
      snapshot.stories.get(row.rowId) ??
      (row.storyId !== null ? snapshot.stories.get(row.storyId) : undefined);
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
    const storySlug = storySlugOf(row);
    const storyNum = row.number === null ? null : String(row.number);
    out.push({
      storyId: row.rowId,
      storySlug,
      storyNum,
      paragraphs,
      presenter,
      durationMs: row.durationMs,
      hash: JSON.stringify([
        storySlug,
        storyNum,
        paragraphs,
        presenter,
        row.durationMs,
      ]),
    });
  }
  return out;
}

/** Longest increasing subsequence of target ranks, returning the kept rank set. */
function lisRanks(sequence: readonly number[]): Set<number> {
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

function storyHeader(story: ProjectedStory): {
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum?: string;
} {
  return {
    storyId: story.storyId,
    storySlug: story.storySlug,
    ...(story.storyNum !== null ? { storyNum: story.storyNum } : {}),
  };
}

/** Streams one rundown's `PrompterFeed` to a DNS-pinned LAN MOS prompter over TCP. */
export async function createMosLanRelay(options: {
  readonly config: MosLanRelayConfig;
  readonly feed: PrompterFeed;
  readonly lookup?: DnsLookupFn;
  readonly onStatus?: (status: MosLinkStatus) => void;
}): Promise<
  | {
      readonly ok: true;
      readonly status: () => MosLinkStatus;
      stop(): Promise<void>;
    }
  | { readonly ok: false; readonly reason: TargetRefusal["code"] }
> {
  const { config, feed, lookup, onStatus } = options;
  const pinned = await resolvePinnedTarget(config.host, config.upperPort, {
    allowedCidrs: config.allowedCidrs,
    lookup,
  });
  if (!pinned.ok) return { ok: false, reason: pinned.code };

  let status: MosLinkStatus = "waiting";
  let stopped = false;
  let seq = 0;
  let created = false;
  let needsResync = false;
  let resyncing = false;
  let lastSyncedStories: ProjectedStory[] = [];
  let chain: Promise<void> = Promise.resolve();

  const setStatus = (next: MosLinkStatus): void => {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  };

  const env = () => {
    seq += 1;
    return { mosId: config.mosId, ncsId: config.ncsId, messageId: seq };
  };

  const storySendMsg = (story: ProjectedStory): MosOutMessage => ({
    ...env(),
    kind: "roStorySend",
    roId: config.rundownId,
    storyId: story.storyId,
    storySlug: story.storySlug,
    ...(story.storyNum !== null ? { storyNum: story.storyNum } : {}),
    paragraphs: story.paragraphs,
    ...(story.presenter !== null ? { presenter: story.presenter } : {}),
    ...(story.durationMs !== null ? { durationMs: story.durationMs } : {}),
    dialect: config.dialect,
  });

  const buildFullResync = (
    next: readonly ProjectedStory[],
  ): MosOutMessage[] => [
    {
      ...env(),
      kind: "roCreate",
      roId: config.rundownId,
      roSlug: config.roSlug,
      dialect: config.dialect,
      stories: next.map(storyHeader),
    },
    ...next.map(storySendMsg),
  ];

  const buildDiffMessages = (
    prev: readonly ProjectedStory[],
    next: readonly ProjectedStory[],
  ): MosOutMessage[] => {
    const messages: MosOutMessage[] = [];
    const prevById = new Map(prev.map((s) => [s.storyId, s]));
    const nextIds = new Set(next.map((s) => s.storyId));

    const removed: string[] = [];
    const surviving: ProjectedStory[] = [];
    for (const s of prev) {
      if (nextIds.has(s.storyId)) surviving.push(s);
      else removed.push(s.storyId);
    }
    if (removed.length > 0) {
      messages.push({
        ...env(),
        kind: "roElementAction",
        roId: config.rundownId,
        operation: "DELETE",
        sourceStoryIds: removed,
      });
    }

    const nextSurviving = next.filter((s) => prevById.has(s.storyId));
    const targetRank = new Map<string, number>();
    for (const [rank, s] of nextSurviving.entries())
      targetRank.set(s.storyId, rank);
    const keptRanks = lisRanks(
      surviving.map((s) => targetRank.get(s.storyId)!),
    );
    for (let rank = nextSurviving.length - 1; rank >= 0; rank -= 1) {
      if (keptRanks.has(rank)) continue;
      const story = nextSurviving[rank]!;
      const after = nextSurviving[rank + 1];
      messages.push({
        ...env(),
        kind: "roElementAction",
        roId: config.rundownId,
        operation: "MOVE",
        ...(after !== undefined ? { targetStoryId: after.storyId } : {}),
        sourceStoryIds: [story.storyId],
      });
    }

    const insertedIds = new Set<string>();
    let idx = next.length - 1;
    while (idx >= 0) {
      if (prevById.has(next[idx]!.storyId)) {
        idx -= 1;
        continue;
      }
      const end = idx;
      while (idx >= 0 && !prevById.has(next[idx]!.storyId)) {
        insertedIds.add(next[idx]!.storyId);
        idx -= 1;
      }
      const run = next.slice(idx + 1, end + 1);
      const after = next[end + 1];
      messages.push({
        ...env(),
        kind: "roElementAction",
        roId: config.rundownId,
        operation: "INSERT",
        ...(after !== undefined ? { targetStoryId: after.storyId } : {}),
        stories: run.map(storyHeader),
      });
    }

    for (const story of next) {
      if (insertedIds.has(story.storyId)) {
        messages.push(storySendMsg(story));
        continue;
      }
      const prior = prevById.get(story.storyId)!;
      const headerChanged =
        prior.storySlug !== story.storySlug ||
        prior.storyNum !== story.storyNum;
      if (headerChanged) {
        messages.push({
          ...env(),
          kind: "roElementAction",
          roId: config.rundownId,
          operation: "REPLACE",
          targetStoryId: story.storyId,
          stories: [storyHeader(story)],
        });
        messages.push(storySendMsg(story));
      } else if (prior.hash !== story.hash) {
        messages.push(storySendMsg(story));
      }
    }

    return messages;
  };

  const client = createMosTcpClient({
    target: pinned,
    onStatus(connected) {
      if (stopped) return;
      if (!connected) {
        needsResync = true;
        setStatus("lost");
        return;
      }
      const wasLost = status === "lost";
      setStatus("live");
      if (wasLost && !resyncing) {
        needsResync = true;
        scheduleSync();
      }
    },
  });

  const flush = async (): Promise<void> => {
    if (stopped) return;
    const snap = feed.current();
    if (snap === null) return;
    const next = projectSnapshot(snap);
    const full = !created || needsResync;
    const messages = full
      ? buildFullResync(next)
      : buildDiffMessages(lastSyncedStories, next);
    if (messages.length === 0) return;

    resyncing = full;
    try {
      for (const msg of messages) {
        if (stopped) return;
        await client.send(msg);
      }
    } catch {
      needsResync = true;
      if (!stopped) setStatus("lost");
      return;
    } finally {
      resyncing = false;
    }

    created = true;
    needsResync = false;
    lastSyncedStories = next;
    if (!stopped) setStatus("live");
  };

  const scheduleSync = (): void => {
    if (stopped) return;
    chain = chain.then(flush, flush);
  };

  const unsubscribe = feed.subscribe(scheduleSync);
  scheduleSync();

  return {
    ok: true,
    status: () => status,
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      await chain.catch(() => {});
      if (created) {
        await client
          .send({ ...env(), kind: "roDelete", roId: config.rundownId })
          .catch(() => {});
      }
      client.close();
      setStatus("off");
    },
  };
}
