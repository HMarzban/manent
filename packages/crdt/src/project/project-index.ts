// A project's index: its maps read and written as JSON, and the typed entries of the maps the server reads.
import { yDocOf } from "../doc.ts";
import type { CrdtDoc, Unsubscribe } from "../doc.ts";
import type { PROJECT_INDEX_MAPS } from "../index-maps.ts";
import { jsonMap } from "../json-map.ts";

export type ProjectIndexMap = (typeof PROJECT_INDEX_MAPS)[number];

/** The origin of a write to a project index, tracked so that each write is one undo step. */
export const ORIGIN_PROJECT_INDEX = "project_index";

/** Every entry of `map` as stored, keys in ascending order. */
export function readProjectMap(
  doc: CrdtDoc,
  map: ProjectIndexMap,
): Readonly<Record<string, unknown>> {
  return jsonMap(doc, map).entries();
}

/**
 * Stores a JSON copy of `value` under `key` of `map`, or removes the key when `value` is null, in one transaction
 * whose origin is ORIGIN_PROJECT_INDEX. A value that is not JSON is a TypeError, and nothing is written.
 */
export function writeProjectKey(
  doc: CrdtDoc,
  map: ProjectIndexMap,
  key: string,
  value: unknown,
): void {
  const view = jsonMap(doc, map);
  // the view's own transaction joins this one, which names the origin
  yDocOf(doc).transact(() => {
    if (value === null) view.delete(key);
    else view.set(key, value);
  }, ORIGIN_PROJECT_INDEX);
}

/** Told the keys of `map` each transaction changed, ascending; "remote" for one applied from another replica or loaded. */
export function observeProjectMap(
  doc: CrdtDoc,
  map: ProjectIndexMap,
  listener: (keys: readonly string[], origin: "local" | "remote") => void,
): Unsubscribe {
  return jsonMap(doc, map).subscribe(listener);
}

export interface SeasonEntry {
  id: string;
  number: number;
  /** Null: the season is called by its number. */
  title: string | null;
}

/** The documents of an episode, each a doc id; null for one not made yet. */
export interface EpisodeDocIds {
  script: string | null;
  outline: string | null;
  roomLog: string | null;
}

/** The comment threads still open in the newest round of the episode's script. */
export interface OpenCount {
  round: string;
  open: number;
}

export interface EpisodeEntry {
  id: string;
  seasonId: string;
  /** The season's number times 100 plus the episode's place: 201 is the first of season 2. */
  number: number;
  /** Null: not named yet. */
  title: string | null;
  writerUserId: string | null;
  /** The name of the draft or revision the script last reached; null before its first draft. */
  stage: string | null;
  dueAt: number | null;
  /** The page count of the script's last draft; null before its first. */
  pages: number | null;
  openCount: OpenCount | null;
  locked: boolean;
  docIds: EpisodeDocIds;
}

/** Null: the group is never given access, only sent drafts. */
export type GroupRole = "edit" | "comment" | null;

export interface GroupEntry {
  id: string;
  name: string;
  role: GroupRole;
  memberUserIds: readonly string[];
  /** Its readers see their name in the page furniture of what they are sent. */
  watermark: boolean;
}

/** Where a copy came from; kept under the copy's doc id. */
export interface SourceEntry {
  /** The document copied. */
  docId: string;
  /** The version copied; null: the document as it was at `copiedAt`. */
  versionId: string | null;
  copiedAt: number;
  /** The copy's chapters, each by the id of the source's chapter it was made from. */
  chapters?: Readonly<Record<string, string>>;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === "string";

const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isDocId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

const orNull =
  <T>(is: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || is(value);

const isTextOrNull = orNull(isText);
const isIntegerOrNull = orNull(isInteger);
const isDocIdOrNull = orNull(isDocId);

function readSeason(value: unknown): SeasonEntry | null {
  if (!isFields(value)) return null;
  const { id, number, title } = value;
  if (!isText(id) || !isInteger(number) || !isTextOrNull(title)) return null;
  return { id, number, title };
}

function readEpisodeDocIds(value: unknown): EpisodeDocIds | null {
  if (!isFields(value)) return null;
  const { script, outline, roomLog } = value;
  if (!isDocIdOrNull(script) || !isDocIdOrNull(outline)) return null;
  return isDocIdOrNull(roomLog) ? { script, outline, roomLog } : null;
}

function readOpenCount(value: unknown): OpenCount | null | "refused" {
  if (value === null) return null;
  if (!isFields(value)) return "refused";
  const { round, open } = value;
  return isText(round) && isInteger(open) ? { round, open } : "refused";
}

function readEpisode(value: unknown): EpisodeEntry | null {
  if (!isFields(value)) return null;
  const { id, seasonId, number, title, writerUserId, stage } = value;
  const { dueAt, pages, locked } = value;
  if (!isText(id) || !isText(seasonId) || !isInteger(number)) return null;
  if (!isTextOrNull(title) || !isTextOrNull(writerUserId)) return null;
  if (!isTextOrNull(stage) || !isIntegerOrNull(dueAt)) return null;
  if (!isIntegerOrNull(pages) || typeof locked !== "boolean") return null;
  const openCount = readOpenCount(value.openCount);
  const docIds = readEpisodeDocIds(value.docIds);
  if (openCount === "refused" || docIds === null) return null;
  return {
    id,
    seasonId,
    number,
    title,
    writerUserId,
    stage,
    dueAt,
    pages,
    openCount,
    locked,
    docIds,
  };
}

const isGroupRole = (value: unknown): value is GroupRole =>
  value === null || value === "edit" || value === "comment";

function readGroup(value: unknown): GroupEntry | null {
  if (!isFields(value)) return null;
  const { id, name, role, memberUserIds, watermark } = value;
  if (!isText(id) || !isText(name) || !isGroupRole(role)) return null;
  if (!Array.isArray(memberUserIds) || !memberUserIds.every(isText))
    return null;
  if (typeof watermark !== "boolean") return null;
  return { id, name, role, memberUserIds, watermark };
}

const isChapters = (
  value: unknown,
): value is Readonly<Record<string, string>> =>
  isFields(value) && Object.values(value).every(isText);

function readSource(value: unknown): SourceEntry | null {
  if (!isFields(value)) return null;
  const { docId, versionId, copiedAt, chapters } = value;
  if (!isDocId(docId) || !isTextOrNull(versionId) || !isInteger(copiedAt))
    return null;
  if (chapters === undefined) return { docId, versionId, copiedAt };
  return isChapters(chapters) ? { docId, versionId, copiedAt, chapters } : null;
}

/** The entries of `map` that `read` accepts, by key; one in another shape reads as absent and stays in the map. */
function entriesOf<T>(
  doc: CrdtDoc,
  map: ProjectIndexMap,
  read: (value: unknown) => T | null,
): Map<string, T> {
  const entries = new Map<string, T>();
  for (const [key, value] of Object.entries(readProjectMap(doc, map))) {
    const entry = read(value);
    if (entry !== null) entries.set(key, entry);
  }
  return entries;
}

/** Keyed by an entry's own id: one stored under another key reads as absent. */
const byOwnId = <T extends { id: string }>(
  entries: Map<string, T>,
): Map<string, T> =>
  new Map([...entries].filter(([key, entry]) => key === entry.id));

/** The project's seasons, by id. */
export function readSeasons(doc: CrdtDoc): Map<string, SeasonEntry> {
  return byOwnId(entriesOf(doc, "seasons", readSeason));
}

/** Stores the season under its id. */
export function writeSeason(doc: CrdtDoc, season: SeasonEntry): void {
  writeProjectKey(doc, "seasons", season.id, season);
}

/** The project's episodes, by id. */
export function readEpisodes(doc: CrdtDoc): Map<string, EpisodeEntry> {
  return byOwnId(entriesOf(doc, "episodes", readEpisode));
}

/** Stores the episode under its id. */
export function writeEpisode(doc: CrdtDoc, episode: EpisodeEntry): void {
  writeProjectKey(doc, "episodes", episode.id, episode);
}

/** The project's groups, by id. */
export function readGroups(doc: CrdtDoc): Map<string, GroupEntry> {
  return byOwnId(entriesOf(doc, "groups", readGroup));
}

/** Stores the group under its id. */
export function writeGroup(doc: CrdtDoc, group: GroupEntry): void {
  writeProjectKey(doc, "groups", group.id, group);
}

/** Where each copy in the project came from, by the copy's doc id. */
export function readSources(doc: CrdtDoc): Map<string, SourceEntry> {
  return entriesOf(doc, "source", readSource);
}

/** Stores where the copy `copyDocId` came from. */
export function writeSource(
  doc: CrdtDoc,
  copyDocId: string,
  source: SourceEntry,
): void {
  writeProjectKey(doc, "source", copyDocId, source);
}
