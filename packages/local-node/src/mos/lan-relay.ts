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
  let prevStories: ProjectedStory[] = [];
  let chain: Promise<void> = Promise.resolve();

  const setStatus = (next: MosLinkStatus): void => {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  };

  const client = createMosTcpClient({
    target: pinned,
    onStatus(connected) {
      if (!stopped) setStatus(connected ? "live" : "lost");
    },
  });

  const env = () => {
    seq += 1;
    return { mosId: config.mosId, ncsId: config.ncsId, messageId: seq };
  };

  const enqueue = (messages: readonly MosOutMessage[]): Promise<void> => {
    const run = async (): Promise<void> => {
      for (const msg of messages) {
        if (stopped && msg.kind !== "roDelete") return;
        try {
          await client.send(msg);
          if (!stopped) setStatus("live");
        } catch {
          if (!stopped) setStatus("lost");
          return;
        }
      }
    };
    chain = chain.then(run, run);
    return chain;
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

  const sync = (): void => {
    if (stopped) return;
    const snap = feed.current();
    if (snap === null) return;
    const next = projectSnapshot(snap);
    const messages: MosOutMessage[] = [];
    if (!created) {
      created = true;
      messages.push({
        ...env(),
        kind: "roCreate",
        roId: config.rundownId,
        roSlug: config.roSlug,
        dialect: config.dialect,
        stories: next.map((s) => ({
          storyId: s.storyId,
          storySlug: s.storySlug,
          ...(s.storyNum !== null ? { storyNum: s.storyNum } : {}),
        })),
      });
      for (const s of next) messages.push(storySendMsg(s));
    } else {
      const prevById = new Map(prevStories.map((s) => [s.storyId, s]));
      const nextIds = new Set(next.map((s) => s.storyId));
      const removed = prevStories
        .filter((s) => !nextIds.has(s.storyId))
        .map((s) => s.storyId);
      if (removed.length > 0) {
        messages.push({
          ...env(),
          kind: "roElementAction",
          roId: config.rundownId,
          operation: "DELETE",
          sourceStoryIds: removed,
        });
      }
      const added = next.filter((s) => !prevById.has(s.storyId));
      if (added.length > 0) {
        messages.push({
          ...env(),
          kind: "roElementAction",
          roId: config.rundownId,
          operation: "INSERT",
          stories: added.map((s) => ({
            storyId: s.storyId,
            storySlug: s.storySlug,
            ...(s.storyNum !== null ? { storyNum: s.storyNum } : {}),
          })),
        });
      }
      for (const s of next) {
        const old = prevById.get(s.storyId);
        if (old === undefined || old.hash !== s.hash)
          messages.push(storySendMsg(s));
      }
    }
    prevStories = next;
    if (messages.length > 0) void enqueue(messages);
  };

  const unsubscribe = feed.subscribe(sync);
  sync();

  return {
    ok: true,
    status: () => status,
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      if (created) {
        await enqueue([
          { ...env(), kind: "roDelete", roId: config.rundownId },
        ]).catch(() => {});
      }
      client.close();
      setStatus("off");
    },
  };
}
