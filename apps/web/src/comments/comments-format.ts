// Formatting and projection helpers for comment threads, replies, notes and rounds.
import type {
  CommentItem,
  CommentOutcome,
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
): string {
  if (anchor === null) return COMMENTS_WORDS.wholeScript;
  const scene = blockScenes.get(anchor.blockId);
  if (scene !== undefined && scene.heading !== "") return scene.heading;
  return COMMENTS_WORDS.wholeScript;
}

export function roundTitleLabel(round: CommentRound): string {
  const dayDate = `${formatDay(round.createdAt)} ${formatDate(round.createdAt)}`;
  return COMMENTS_WORDS.roundTitle(round.name, dayDate);
}

export function resolvedOutcomeLabel(outcome: CommentOutcome | null): string {
  if (outcome === "addressed") return COMMENTS_WORDS.addressed;
  if (outcome === "declined") return COMMENTS_WORDS.declined;
  return COMMENTS_WORDS.resolvedOutcome;
}

export function resolvedLineLabel(
  thread: CommentThread,
  people: readonly CommentPerson[],
  now: number,
): string {
  if (thread.state.kind !== "resolved") return "";
  return COMMENTS_WORDS.resolvedLine(
    firstNameFor(thread.state.byUserId, people),
    resolvedOutcomeLabel(thread.state.outcome),
    formatDayTime(thread.state.at, now),
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
