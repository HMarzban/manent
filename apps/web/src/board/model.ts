// The Board's entries in the project index's `board` map: validated reads, code-unit order and single-entry writes.
import { orderKeyBetween } from "@manent/crdt";
import type { JsonMapView } from "@manent/crdt";

const STORYLINE_PREFIX = "storyline:";
const CARD_PREFIX = "card:";
const CELL_PREFIX = "cell:";
const ORDER_KEY = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export type StorylineTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const STORYLINE_TONES: readonly StorylineTone[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

export interface StorylineEntry {
  readonly title: string;
  readonly order: string;
  /** Optional qualitative lane index (1..10) mapped to --collab-* tokens; absent/null = deterministic automatic lane. */
  readonly tone?: StorylineTone | null;
}

export interface BoardStoryline extends StorylineEntry {
  readonly id: string;
}

export interface CardLink {
  readonly blockId: string;
}

export interface CardEntry {
  readonly storylineId: string;
  readonly episodeId: string;
  readonly text: string;
  readonly order: string;
  readonly link: CardLink | null;
  /** Optional writers' room attention flag; absent/false means unflagged. */
  readonly flagged?: boolean;
}

export interface BoardCard extends CardEntry {
  readonly id: string;
}

export interface BoardSnapshot {
  readonly storylines: readonly BoardStoryline[];
  readonly cards: readonly BoardCard[];
}

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isOrderKey = (value: unknown): value is string =>
  typeof value === "string" && ORDER_KEY.test(value);

const isStorylineTone = (value: unknown): value is StorylineTone =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 10;

export { resolveStorylineLanes } from "./board-lanes.ts";

/** Code-unit order matching `orderKeyBetween`, with ties broken by id. */
export function compareOrdered(
  a: { readonly order: string; readonly id: string },
  b: { readonly order: string; readonly id: string },
): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function readStoryline(id: string, value: unknown): BoardStoryline | null {
  if (!isFields(value)) return null;
  const { title, order, tone } = value;
  if (typeof title !== "string" || !isOrderKey(order)) return null;
  if (tone !== undefined && tone !== null && !isStorylineTone(tone)) {
    return { id, title, order };
  }
  return tone === undefined || tone === null
    ? { id, title, order }
    : { id, title, order, tone };
}

function readCardLink(value: unknown): CardLink | null | "refused" {
  if (value === null) return null;
  if (!isFields(value) || !isNonEmpty(value.blockId)) return "refused";
  return { blockId: value.blockId };
}

function readCard(id: string, value: unknown): BoardCard | null {
  if (!isFields(value)) return null;
  const { storylineId, episodeId, text, order, flagged } = value;
  if (!isNonEmpty(storylineId) || !isNonEmpty(episodeId)) return null;
  if (typeof text !== "string" || !isOrderKey(order)) return null;
  const link = readCardLink(value.link);
  if (link === "refused") return null;
  return flagged === true
    ? { id, storylineId, episodeId, text, order, link, flagged: true }
    : { id, storylineId, episodeId, text, order, link };
}

/** Reads every valid storyline and card from `map`; malformed entries read as absent and stay untouched. */
export function readBoard(map: JsonMapView): BoardSnapshot {
  const storylines: BoardStoryline[] = [];
  const cards: BoardCard[] = [];
  for (const [key, value] of Object.entries(map.entries())) {
    if (key.startsWith(STORYLINE_PREFIX)) {
      const id = key.slice(STORYLINE_PREFIX.length);
      if (id.length === 0) continue;
      const entry = readStoryline(id, value);
      if (entry !== null) storylines.push(entry);
    } else if (key.startsWith(CARD_PREFIX)) {
      const id = key.slice(CARD_PREFIX.length);
      if (id.length === 0) continue;
      const entry = readCard(id, value);
      if (entry !== null) cards.push(entry);
    }
  }
  return {
    storylines: storylines.toSorted(compareOrdered),
    cards: cards.toSorted(compareOrdered),
  };
}

/** Disjoint list identifier for a `(storylineId, episodeId)` cell in `SortableLists`. */
export function cellKey(storylineId: string, episodeId: string): string {
  return `${CELL_PREFIX}${encodeURIComponent(storylineId)}:${encodeURIComponent(episodeId)}`;
}

/** Decodes a cell list identifier; null for any other string. */
export function parseCellKey(
  key: string,
): { readonly storylineId: string; readonly episodeId: string } | null {
  if (!key.startsWith(CELL_PREFIX)) return null;
  const rest = key.slice(CELL_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep === rest.length - 1) return null;
  try {
    return {
      storylineId: decodeURIComponent(rest.slice(0, sep)),
      episodeId: decodeURIComponent(rest.slice(sep + 1)),
    };
  } catch {
    // malformed percent-encoding is not a cell key
    return null;
  }
}

/** Cards in the cell `(storylineId, episodeId)`, in order. */
export function cardsInCell(
  cards: readonly BoardCard[],
  storylineId: string,
  episodeId: string,
): readonly BoardCard[] {
  return cards.filter(
    (card) => card.storylineId === storylineId && card.episodeId === episodeId,
  );
}

/**
 * A fractional order key placing a single entry at `index` among `ordered`. When concurrent writers produced tied
 * keys around `index`, the upper bound advances to the next strictly greater key so a single write always succeeds.
 */
export function orderKeyAt(
  ordered: readonly { readonly order: string }[],
  index: number,
): string {
  const clamped = Math.min(Math.max(0, index), ordered.length);
  const before = clamped > 0 ? (ordered[clamped - 1]?.order ?? null) : null;
  let afterIndex = clamped;
  if (before !== null) {
    while (
      afterIndex < ordered.length &&
      (ordered[afterIndex]?.order ?? "") <= before
    ) {
      afterIndex++;
    }
  }
  const after =
    afterIndex < ordered.length ? (ordered[afterIndex]?.order ?? null) : null;
  return orderKeyBetween(before, after);
}

const storylineKey = (id: string): string => `${STORYLINE_PREFIX}${id}`;
const cardKey = (id: string): string => `${CARD_PREFIX}${id}`;

function writeStoryline(map: JsonMapView, storyline: BoardStoryline): void {
  const entry: StorylineEntry =
    storyline.tone !== undefined && storyline.tone !== null
      ? { title: storyline.title, order: storyline.order, tone: storyline.tone }
      : { title: storyline.title, order: storyline.order };
  map.set(storylineKey(storyline.id), entry);
}

function writeCard(map: JsonMapView, card: BoardCard): void {
  const entry: CardEntry = {
    storylineId: card.storylineId,
    episodeId: card.episodeId,
    text: card.text,
    order: card.order,
    link: card.link === null ? null : { blockId: card.link.blockId },
    ...(card.flagged === true ? { flagged: true } : {}),
  };
  map.set(cardKey(card.id), entry);
}

export function addStoryline(
  map: JsonMapView,
  storylines: readonly BoardStoryline[],
  id: string,
  title: string,
): BoardStoryline {
  const created: BoardStoryline = {
    id,
    title,
    order: orderKeyAt(storylines, storylines.length),
  };
  writeStoryline(map, created);
  return created;
}

export function renameStoryline(
  map: JsonMapView,
  storyline: BoardStoryline,
  title: string,
): void {
  writeStoryline(map, { ...storyline, title });
}

export function setStorylineTone(
  map: JsonMapView,
  storyline: BoardStoryline,
  tone: StorylineTone | null,
): void {
  writeStoryline(map, { ...storyline, tone });
}

/** Moves `storyline` to `targetIndex` among `storylines` via a single fractional order-key write. */
export function moveStoryline(
  map: JsonMapView,
  storyline: BoardStoryline,
  storylines: readonly BoardStoryline[],
  targetIndex: number,
): BoardStoryline {
  const others = storylines.filter((other) => other.id !== storyline.id);
  const next: BoardStoryline = {
    ...storyline,
    order: orderKeyAt(others, targetIndex),
  };
  writeStoryline(map, next);
  return next;
}

/** Removes the storyline and every card belonging to it, returning the removed cards for Undo. */
export function removeStoryline(
  map: JsonMapView,
  storyline: BoardStoryline,
  cards: readonly BoardCard[],
): readonly BoardCard[] {
  const owned = cards.filter((card) => card.storylineId === storyline.id);
  for (const card of owned) map.delete(cardKey(card.id));
  map.delete(storylineKey(storyline.id));
  return owned;
}

export function restoreStoryline(
  map: JsonMapView,
  storyline: BoardStoryline,
  cards: readonly BoardCard[],
): void {
  writeStoryline(map, storyline);
  for (const card of cards) writeCard(map, card);
}

export function addCard(
  map: JsonMapView,
  cellCards: readonly BoardCard[],
  input: {
    readonly id: string;
    readonly storylineId: string;
    readonly episodeId: string;
    readonly text: string;
  },
): BoardCard {
  const created: BoardCard = {
    id: input.id,
    storylineId: input.storylineId,
    episodeId: input.episodeId,
    text: input.text,
    order: orderKeyAt(cellCards, cellCards.length),
    link: null,
  };
  writeCard(map, created);
  return created;
}

export function editCardText(
  map: JsonMapView,
  card: BoardCard,
  text: string,
): void {
  writeCard(map, { ...card, text });
}

export function setCardLink(
  map: JsonMapView,
  card: BoardCard,
  link: CardLink | null,
): void {
  writeCard(map, { ...card, link });
}

export function setCardFlagged(
  map: JsonMapView,
  card: BoardCard,
  flagged: boolean,
): void {
  writeCard(map, { ...card, flagged });
}

/** Duplicates `source` immediately after it in the same cell without claiming its scene link. */
export function duplicateCard(
  map: JsonMapView,
  cellCards: readonly BoardCard[],
  source: BoardCard,
  id: string,
): BoardCard {
  const index = cellCards.findIndex((c) => c.id === source.id);
  const insertAt = index === -1 ? cellCards.length : index + 1;
  const created: BoardCard = {
    id,
    storylineId: source.storylineId,
    episodeId: source.episodeId,
    text: source.text,
    order: orderKeyAt(cellCards, insertAt),
    link: null,
    ...(source.flagged === true ? { flagged: true } : {}),
  };
  writeCard(map, created);
  return created;
}

/**
 * Rewrites one card's entry at its new place so concurrent moves never duplicate it. Moving to another episode clears
 * any scene link belonging to the previous episode's script.
 */
export function moveCard(
  map: JsonMapView,
  card: BoardCard,
  targetStorylineId: string,
  targetEpisodeId: string,
  allCards: readonly BoardCard[],
  targetIndex: number,
): BoardCard {
  const others = cardsInCell(
    allCards,
    targetStorylineId,
    targetEpisodeId,
  ).filter((other) => other.id !== card.id);
  const next: BoardCard = {
    ...card,
    storylineId: targetStorylineId,
    episodeId: targetEpisodeId,
    order: orderKeyAt(others, targetIndex),
    link: targetEpisodeId === card.episodeId ? card.link : null,
  };
  writeCard(map, next);
  return next;
}

export function removeCard(map: JsonMapView, cardId: string): void {
  map.delete(cardKey(cardId));
}

export function restoreCard(map: JsonMapView, card: BoardCard): void {
  writeCard(map, card);
}
