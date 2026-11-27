// Pure readers and row-fact helpers for the Library's series view: access, people, target pages, ladder, board stats, due urgency, last edited and place.
import { readProjectMap } from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import { SETTINGS } from "@manent/settings";
import type { DocStatus } from "@manent/sync-client";
import { DOC_ROLES } from "@manent/sync-protocol";
import type { RowPlace } from "../../../services/ports.ts";
import { nameOf } from "../../../services/sync/index-entries.ts";
import type {
  ContinueEntry,
  DocumentEntry,
} from "../../../services/sync/index-entries.ts";

export interface SeriesPerson {
  readonly userId: string;
  readonly name: string;
}

export type EpisodeLastEdited =
  | { readonly changedSinceOpened: true }
  | { readonly byName: string; readonly at: number }
  | null;

export type DueUrgency = "overdue" | "soon" | "normal";

export interface SeasonStats {
  readonly total: number;
  readonly locked: number;
  readonly openNotes: number;
  readonly overdue: number;
  readonly overTarget: number;
  readonly boardCards: number;
}

const SOON_DAYS = 3;

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

export async function askProjectApi(
  path: string,
  docId: string,
  token: string | null,
): Promise<unknown> {
  const answer = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  return answer.json().catch(() => null);
}

export function readCanEdit(described: unknown): boolean | null {
  const role = field(described, "role");
  if (!DOC_ROLES.some((known) => known === role)) return null;
  return role === "owner" || role === "edit";
}

export function readPeopleList(listed: unknown): readonly SeriesPerson[] {
  const people = field(listed, "people");
  if (!Array.isArray(people)) return [];
  return people.flatMap((person: unknown) => {
    const userId = field(person, "userId");
    const name = field(person, "name");
    return typeof userId === "string" && typeof name === "string"
      ? [{ userId, name }]
      : [];
  });
}

export function readTargetPages(doc: CrdtDoc): number | null {
  const raw = readProjectMap(doc, "template")["project.targetPages"];
  const parsed = SETTINGS.get("project.targetPages").type.parse(raw);
  return parsed.ok && typeof parsed.value === "number" ? parsed.value : null;
}

export function readProjectLadder(doc: CrdtDoc): readonly string[] {
  const raw = readProjectMap(doc, "ladder")["project.ladder"];
  const parsed = SETTINGS.get("project.ladder").type.parse(raw);
  if (!parsed.ok || !Array.isArray(parsed.value)) return [];
  return parsed.value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim() !== "",
  );
}

/** Counts Board cards per season from the project index's `board` map (`c:<id>` entries). */
export function readBoardCardsBySeason(
  doc: CrdtDoc,
  episodes: readonly EpisodeEntry[],
): ReadonlyMap<string, number> {
  const seasonByEpisode = new Map(episodes.map((ep) => [ep.id, ep.seasonId]));
  const counts = new Map<string, number>();
  const board = readProjectMap(doc, "board");
  for (const [key, value] of Object.entries(board)) {
    if (!key.startsWith("c:")) continue;
    const epId = field(value, "episodeId");
    if (typeof epId !== "string") continue;
    const seasonId = seasonByEpisode.get(epId);
    if (seasonId !== undefined) {
      counts.set(seasonId, (counts.get(seasonId) ?? 0) + 1);
    }
  }
  return counts;
}

function localDayIndex(at: number): number {
  const d = new Date(at);
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
}

/** Classifies a due timestamp relative to local calendar day `now`. */
export function dueUrgency(
  dueAt: number | null,
  now: number,
): DueUrgency | null {
  if (dueAt === null) return null;
  const deltaDays = localDayIndex(dueAt) - localDayIndex(now);
  if (deltaDays < 0) return "overdue";
  if (deltaDays <= SOON_DAYS) return "soon";
  return "normal";
}

/** Whether an episode needs showrunner attention (open notes, overdue date, or over target pages). */
export function episodeNeedsAttention(
  episode: EpisodeEntry,
  targetPages: number | null,
  now: number,
): boolean {
  if (episode.openCount !== null && episode.openCount.open > 0) return true;
  if (dueUrgency(episode.dueAt, now) === "overdue") return true;
  return (
    targetPages !== null &&
    episode.pages !== null &&
    episode.pages > targetPages
  );
}

export function computeSeasonStats(
  episodes: readonly EpisodeEntry[],
  targetPages: number | null,
  boardCards: number,
  now: number,
): SeasonStats {
  let locked = 0;
  let openNotes = 0;
  let overdue = 0;
  let overTarget = 0;
  for (const ep of episodes) {
    if (ep.locked) locked += 1;
    if (ep.openCount !== null && ep.openCount.open > 0) {
      openNotes += ep.openCount.open;
    }
    if (dueUrgency(ep.dueAt, now) === "overdue") overdue += 1;
    if (targetPages !== null && ep.pages !== null && ep.pages > targetPages) {
      overTarget += 1;
    }
  }
  return {
    total: episodes.length,
    locked,
    openNotes,
    overdue,
    overTarget,
    boardCards,
  };
}

export function placeFromStatus(
  status: DocStatus,
  signedIn: boolean,
  online: boolean,
): RowPlace {
  if (status.side.includes("access_removed") || status.side.includes("deleted"))
    return { kind: "not_on_device" };
  if (status.neverSynced && status.waiting === 0) {
    if (!signedIn) return { kind: "never_synced" };
    return online ? { kind: "on_server" } : { kind: "not_on_device" };
  }
  if (status.waiting > 0) return { kind: "waiting", count: status.waiting };
  return { kind: "synced" };
}

export function computeLastEdited(
  docId: string,
  documents: ReadonlyMap<string, DocumentEntry>,
  continued: ReadonlyMap<string, ContinueEntry>,
  viewerUserId: string,
  people: readonly SeriesPerson[],
): EpisodeLastEdited {
  const entry = documents.get(docId);
  if (entry === undefined) return null;
  const openedAt = continued.get(docId)?.openedAt;
  if (
    entry.editedAt !== null &&
    entry.editedByUserId !== viewerUserId &&
    openedAt !== undefined &&
    entry.editedAt > openedAt
  ) {
    return { changedSinceOpened: true };
  }
  if (entry.editedAt !== null && entry.editedByUserId !== null) {
    const person = people.find((p) => p.userId === entry.editedByUserId);
    const byName = person?.name.split(" ")[0] ?? nameOf(entry.editedByUserId);
    return { byName, at: entry.editedAt };
  }
  return null;
}
