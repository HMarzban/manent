// Pure filtering, counting and sorting helpers for the Comments tab.
import type {
  CommentFlag,
  CommentItem,
  CommentRound,
  CommentThread,
} from "@manent/crdt";
import type { ScriptCommentsState } from "./comments-types.ts";

export interface ThreadEntry {
  readonly id: string;
  readonly thread: CommentThread;
  readonly items: readonly CommentItem[];
  readonly flags: readonly CommentFlag[];
}

export interface RoundEntry {
  readonly id: string;
  readonly round: CommentRound;
}

export type RoundThreadFilter = "all" | "open" | "resolved";

export interface CommentFilterCounts {
  readonly open: number;
  readonly mine: number;
  readonly writers: number;
}

export interface RoundTriageStats {
  readonly total: number;
  readonly open: number;
  readonly resolved: number;
}

export function sortedRounds(
  rounds: Readonly<Record<string, CommentRound>>,
): readonly RoundEntry[] {
  return Object.entries(rounds)
    .map(([id, round]) => ({ id, round }))
    .toSorted((a, b) => b.round.createdAt - a.round.createdAt);
}

export function isMineThread(
  thread: CommentThread,
  items: readonly CommentItem[],
  flags: readonly CommentFlag[],
  userId: string,
): boolean {
  if (thread.authorUserId === userId) return true;
  if (
    items.some(
      (item) =>
        item.authorUserId === userId || item.mentionedUserIds.includes(userId),
    )
  )
    return true;
  return flags.some((flag) => flag.flaggedUserId === userId);
}

function indexThreadDetails(state: ScriptCommentsState): {
  byThreadItems: Map<string, CommentItem[]>;
  byThreadFlags: Map<string, CommentFlag[]>;
} {
  const byThreadItems = new Map<string, CommentItem[]>();
  for (const item of Object.values(state.items)) {
    const list = byThreadItems.get(item.threadId) ?? [];
    list.push(item);
    byThreadItems.set(item.threadId, list);
  }
  const byThreadFlags = new Map<string, CommentFlag[]>();
  for (const flag of Object.values(state.flags)) {
    const list = byThreadFlags.get(flag.threadId) ?? [];
    list.push(flag);
    byThreadFlags.set(flag.threadId, list);
  }
  return { byThreadItems, byThreadFlags };
}

export function commentCounts(
  state: ScriptCommentsState,
  userId: string,
): CommentFilterCounts {
  const { byThreadItems, byThreadFlags } = indexThreadDetails(state);
  let open = 0;
  let mine = 0;
  for (const [id, thread] of Object.entries(state.threads)) {
    if (thread.state.kind === "open") open += 1;
    if (thread.state.kind === "resolved" && thread.roundId !== null) continue;
    const items = byThreadItems.get(id) ?? [];
    const flags = byThreadFlags.get(id) ?? [];
    if (isMineThread(thread, items, flags, userId)) mine += 1;
  }
  return { open, mine, writers: state.canEdit ? state.notes.length : 0 };
}

export function roundStats(
  state: ScriptCommentsState,
  roundId: string,
): RoundTriageStats {
  let total = 0;
  let open = 0;
  let resolved = 0;
  for (const thread of Object.values(state.threads)) {
    if (thread.roundId !== roundId) continue;
    total += 1;
    if (thread.state.kind === "open") open += 1;
    else resolved += 1;
  }
  return { total, open, resolved };
}

export function filteredThreads(
  state: ScriptCommentsState,
  filter: string,
  userId: string,
  roundState: RoundThreadFilter = "all",
): readonly ThreadEntry[] {
  if (filter === "writers") return [];
  const { byThreadItems, byThreadFlags } = indexThreadDetails(state);
  const roundId = filter.startsWith("round:")
    ? filter.slice("round:".length)
    : null;

  const list: ThreadEntry[] = [];
  for (const [id, thread] of Object.entries(state.threads)) {
    const items = (byThreadItems.get(id) ?? []).toSorted(
      (a, b) => a.createdAt - b.createdAt,
    );
    const flags = byThreadFlags.get(id) ?? [];
    if (roundId !== null) {
      if (thread.roundId !== roundId) continue;
      if (roundState === "open" && thread.state.kind !== "open") continue;
      if (roundState === "resolved" && thread.state.kind !== "resolved")
        continue;
    } else if (filter === "open") {
      if (thread.state.kind !== "open") continue;
    } else if (filter === "mine") {
      if (thread.state.kind === "resolved" && thread.roundId !== null) continue;
      if (!isMineThread(thread, items, flags, userId)) continue;
    }
    list.push({ id, thread, items, flags });
  }
  return list.toSorted((a, b) => b.thread.createdAt - a.thread.createdAt);
}
