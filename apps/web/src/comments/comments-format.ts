// Formatting and projection helpers for comment threads, replies, notes and rounds.
import type {
  CommentFlag,
  CommentItem,
  CommentRound,
  CommentThread,
} from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import {
  COMMENTS_WORDS,
  formatDate,
  formatDay,
  formatDayTime,
} from "@manent/ui";
import { fullNameOf } from "../services/sync/index-entries.ts";
import type { SceneBlockInfo } from "./comments-types.ts";
import type { CommentPerson } from "./people-request.ts";

export interface BodySegment {
  readonly text: string;
  readonly mention: boolean;
}

export function fullNameFor(
  userId: string,
  people: readonly CommentPerson[],
): string {
  return people.find((p) => p.userId === userId)?.name ?? fullNameOf(userId);
}

export function firstNameFor(
  userId: string,
  people: readonly CommentPerson[],
): string {
  const full = fullNameFor(userId, people);
  return full.split(" ")[0] ?? full;
}

export function anchorPlaceLabel(
  anchor: TextAnchor | null,
  blockScenes: ReadonlyMap<string, SceneBlockInfo>,
): string | null {
  if (anchor === null) return COMMENTS_WORDS.wholeScript;
  const info = blockScenes.get(anchor.blockId);
  if (info === undefined) return null;
  if (
    anchor.start === 0 &&
    anchor.end === 0 &&
    anchor.blockId === info.sceneBlockId &&
    info.sceneNumber !== null
  ) {
    return COMMENTS_WORDS.scenePlace(info.sceneNumber);
  }
  if (info.pageLabel !== null) return COMMENTS_WORDS.pagePlace(info.pageLabel);
  if (info.sceneNumber !== null)
    return COMMENTS_WORDS.scenePlace(info.sceneNumber);
  return null;
}

export function roundTitleLabel(round: CommentRound): string {
  const dayDate = `${formatDay(round.createdAt)} ${formatDate(round.createdAt)}`;
  return COMMENTS_WORDS.roundTitle(round.name, dayDate);
}

export function resolvedLineLabel(
  thread: CommentThread,
  people: readonly CommentPerson[],
  now: number,
): string {
  if (thread.state.kind !== "resolved") return "";
  return COMMENTS_WORDS.resolvedLine(
    thread.state.outcome,
    fullNameFor(thread.state.byUserId, people),
    formatDayTime(thread.state.at, now),
  );
}

export function flaggedLabel(
  flags: readonly CommentFlag[],
  authorUserId: string,
  currentUserId: string,
  people: readonly CommentPerson[],
): string | null {
  if (flags.length === 0) return null;
  const own = flags.find((f) => f.flaggedUserId === currentUserId);
  const chosen = own ?? flags[0]!;
  const byFirst = firstNameFor(authorUserId, people);
  if (chosen.flaggedUserId === currentUserId) {
    return COMMENTS_WORDS.flaggedForYou(byFirst);
  }
  return COMMENTS_WORDS.flaggedForOther(
    firstNameFor(chosen.flaggedUserId, people),
    byFirst,
  );
}

export function threadItemsOf(
  threadId: string,
  items: Readonly<Record<string, CommentItem>>,
): readonly CommentItem[] {
  return Object.values(items)
    .filter((item) => item.threadId === threadId)
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

/** Splits `body` into plain text and `@Full Name` mention runs for every user in `mentionedUserIds`. */
export function splitBodyMentions(
  body: string,
  mentionedUserIds: readonly string[],
  people: readonly CommentPerson[],
): readonly BodySegment[] {
  const tokens = [
    ...new Set(
      mentionedUserIds.map((id) =>
        COMMENTS_WORDS.mention(fullNameFor(id, people)),
      ),
    ),
  ].toSorted((a, b) => b.length - a.length);
  if (tokens.length === 0) return [{ text: body, mention: false }];
  const segments: BodySegment[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    let bestAt = -1;
    let bestToken = "";
    for (const token of tokens) {
      const at = body.indexOf(token, cursor);
      if (at !== -1 && (bestAt === -1 || at < bestAt)) {
        bestAt = at;
        bestToken = token;
      }
    }
    if (bestAt === -1) {
      segments.push({ text: body.slice(cursor), mention: false });
      break;
    }
    if (bestAt > cursor) {
      segments.push({ text: body.slice(cursor, bestAt), mention: false });
    }
    segments.push({ text: bestToken, mention: true });
    cursor = bestAt + bestToken.length;
  }
  return segments;
}

export function dayTimeLabel(at: number, now: number): string {
  return formatDayTime(at, now);
}
