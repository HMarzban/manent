// Where the person's typing in each document goes: to everyone as they type, as suggestions, or to a private copy.
import type { LinkFacts } from "@manent/sync-client";
import type { Subscribable } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { createTargetBindings } from "../writing/target-bindings.ts";
import type { GivenUp, TargetOutcome } from "../writing/target-bindings.ts";
import {
  copyEntryOf,
  isFields,
  keptPosition,
  openWritingIndex,
} from "../writing/writing-index.ts";
import type { WritingIndex } from "../writing/writing-index.ts";

export type { TargetOutcome } from "../writing/target-bindings.ts";

const WRITING_POSITIONS = ["everyone", "suggestions", "private"] as const;
export type WritingPosition = (typeof WRITING_POSITIONS)[number];

type Bindable = Pick<PersonServices, "userId" | "openHandle"> & {
  ready?: Promise<void>;
};

// the services whose private index is read; replaced when another person's services bind
let bound: Bindable | null = null;
let index: WritingIndex | null = null;
let stopIndex = (): void => {};
// the server has answered for the bound index, or cannot be reached: until then no document's target is known
let known = false;
const knowing = new Set<() => void>();
// by room docId: a private copy made in this tab, opened before the index holds its entry, with that move's `at`
const made = new Map<string, { privateDocId: string; at: number }>();
// by room docId: whether someone else has a role on it, the server's last answer in this tab
const access = new Map<string, boolean>();
const listeners = new Set<() => void>();
const followed = new Map<string, Subscribable<WritingPosition>>();
// by room docId: the entry kept before this tab moved it to private, and that move's `at`
const before = new Map<string, { at: number; entry: unknown }>();

const addListener = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const tell = (): void => {
  sessions.settleMoved();
  for (const listener of listeners) listener();
};

/**
 * Puts back the position kept before this tab's move of `docId` to private, unless another has been kept since; false
 * when there was no such move to put back.
 */
function rollBack(docId: string): boolean {
  const prior = before.get(docId);
  before.delete(docId);
  if (prior === undefined || index === null) return false;
  const entry = index.writing.get(docId);
  if (!isFields(entry) || entry.at !== prior.at) return false;
  made.delete(docId);
  if (prior.entry === null) index.writing.delete(docId);
  else index.writing.set(docId, prior.entry);
  return true;
}

/** Drops any local `made` entry whose move has been superseded by a non-local or newer writing entry. */
function invalidateMade(
  opened: WritingIndex,
  keys: readonly string[],
  origin: "local" | "remote",
): void {
  for (const key of keys) {
    const fresh = made.get(key);
    if (fresh === undefined) continue;
    if (origin === "remote") {
      made.delete(key);
      continue;
    }
    const entry = opened.writing.get(key);
    if (
      !isFields(entry) ||
      entry.at !== fresh.at ||
      entry.position !== "private"
    )
      made.delete(key);
  }
}

/** The private copy `docId` opens while the person writes it privately; null while none is open. */
function copyOf(docId: string): string | null {
  if (index === null) return null;
  const entry = copyEntryOf(index, docId);
  const writing = index.writing.get(docId);
  const freshEntry = made.get(docId);
  const fresh =
    freshEntry !== undefined &&
    isFields(writing) &&
    writing.at === freshEntry.at &&
    writing.position === "private"
      ? freshEntry.privateDocId
      : null;
  if (entry === null) return fresh;
  if (!entry.handedIn) return entry.privateDocId;
  return fresh !== entry.privateDocId ? fresh : null;
}

function positionOf(docId: string): WritingPosition {
  const kept = index === null ? null : keptPosition(index, docId);
  // a position kept as private reads as private only while there is a copy to open, so the two never disagree
  if (kept === "private") return copyOf(docId) === null ? "everyone" : kept;
  return kept ?? WRITING_POSITIONS[0];
}

/** The document the person's editor of `docId` opens. */
const targetOf = (docId: string): string =>
  positionOf(docId) === "private" ? (copyOf(docId) ?? docId) : docId;

function followPosition(docId: string): Subscribable<WritingPosition> {
  const held = followed.get(docId);
  if (held !== undefined) return held;
  const position: Subscribable<WritingPosition> = {
    get: () => positionOf(docId),
    subscribe: (listener) => addListener(() => listener(positionOf(docId))),
  };
  followed.set(docId, position);
  return position;
}

const sessions = createTargetBindings({
  stateOf(docId) {
    const kept = index === null ? null : keptPosition(index, docId);
    const copy = copyOf(docId);
    return {
      known,
      target: kept === "private" ? (copy ?? docId) : docId,
      keptPrivate: kept === "private",
      hasCopy: copy !== null,
    };
  },
  followChanges: (docId, listener) => followPosition(docId).subscribe(listener),
  rollBack,
  addListener,
  tell,
});

/**
 * Calls `then` once every document's target is known: the server has answered for the person's index, or this tab
 * leads `link` and it is offline, so the index as the device holds it is all there is. The returned function stops.
 */
function whenKnown(
  link: Subscribable<LinkFacts>,
  then: () => void,
): () => void {
  if (known) {
    then();
    return () => {};
  }
  // a following tab's link reads offline whatever the leading tab's is, so only a leading tab's says the device's
  const check = (): void => {
    const { leader, state } = link.get();
    if (index !== null && leader && state === "offline") learn();
  };
  const stopLink = link.subscribe(check);
  listeners.add(check);
  const stop = (): void => {
    knowing.delete(waiting);
    listeners.delete(check);
    stopLink();
  };
  const waiting = (): void => {
    stop();
    then();
  };
  knowing.add(waiting);
  check();
  return stop;
}

/** From now on every document's target is known. */
function learn(): void {
  known = true;
  const waiting = [...knowing];
  knowing.clear();
  for (const then of waiting) then();
  tell();
}

function bindIndex(services: Bindable): void {
  if (bound === services) return;
  bound = services;
  stopIndex();
  index = null;
  known = false;
  made.clear();
  before.clear();
  tell();
  let stopped = false;
  stopIndex = () => {
    stopped = true;
  };
  void (async () => {
    await services.ready;
    if (stopped) return;
    const opened = await openWritingIndex(services);
    if (stopped) return opened.close();
    index = opened;
    // a device that has not received the index yet would open for everyone a script written privately elsewhere
    const stops = [
      opened.writing.subscribe((keys, origin) => {
        invalidateMade(opened, keys, origin);
        tell();
      }),
      opened.copies.subscribe(tell),
      opened.whenAnswered(learn),
    ];
    stopIndex = () => {
      stopped = true;
      for (const stop of stops) stop();
      opened.close();
    };
    // what the device holds of the index is read: an offline leading tab need wait for nothing more
    tell();
  })().catch(() => {
    // a sync that could not start holds no private index: every document reads as written for everyone
    if (!stopped) learn();
  });
}

/**
 * `writingPositionOf`: where the person's typing in a document goes. `openTarget`: the document the person's editor
 * of a document opens: their private copy while they write it privately, else the document itself; `followTarget`
 * hears it move, and `boundTarget` is the one the editor session shows. `get` is what a command's context reads, and
 * `subscribe`'s listener hears every change. Until `bind` has read the person's private index, every document reads as
 * written for everyone; until the server has answered for it, or the device cannot reach the server, no target is
 * known.
 */
export const writingActions: {
  writingPositionOf(docId: string): Subscribable<WritingPosition>;
  openTarget(docId: string): string;
  followTarget(
    docId: string,
    opened: string,
    open: (target: string, wanted: () => boolean) => Promise<TargetOutcome>,
  ): () => void;
  /** The target `docId`'s editor session shows; null while no session shows it. */
  boundTarget(docId: string): Subscribable<string | null>;
  whenBound(docId: string, target: string): Promise<TargetOutcome>;
  isWritable(docId: string): boolean;
  whenKnown(link: Subscribable<LinkFacts>, then: () => void): () => void;
  /** Tells `listener` why `docId`'s session gave up a private copy this tab did not move to, until the returned function stops. */
  onGivenUp(docId: string, listener: (outcome: GivenUp) => void): () => void;
  /** Holds `docId`'s editor read-only while a hand-in delivers its changes, until the returned function lets go. */
  holdInput(docId: string): () => void;
  get(docId: string): { position: WritingPosition; othersHaveAccess: boolean };
  subscribe(listener: () => void): () => void;
  /** Reads the private index of the person of `services` from now on; the same services again change nothing. */
  bind(services: Bindable): void;
  /** The bound private index once it has been read; null before. */
  index(): WritingIndex | null;
  /**
   * Keeps `position` for `docId` in the private index, `at` in milliseconds since the epoch; `privateDocId` is the
   * copy a move to private opens, null otherwise. Nothing is kept before the index has been read.
   */
  keep(
    docId: string,
    move: {
      position: WritingPosition;
      at: number;
      privateDocId: string | null;
    },
  ): void;
  /** The server's answer on whether someone else has a role on `docId`. */
  setAccess(docId: string, othersHaveAccess: boolean): void;
  /** Null while the server has not answered in this tab. */
  access(docId: string): boolean | null;
} = Object.freeze({
  writingPositionOf: followPosition,
  openTarget: targetOf,
  followTarget: sessions.followTarget,
  boundTarget: sessions.boundTarget,
  whenBound: sessions.whenBound,
  isWritable: sessions.isWritable,
  whenKnown,
  onGivenUp: sessions.onGivenUp,
  holdInput: sessions.holdInput,
  get: (docId: string) => ({
    position: positionOf(docId),
    othersHaveAccess: access.get(docId) ?? false,
  }),
  subscribe: addListener,
  bind: bindIndex,
  index: () => index,
  keep(
    docId: string,
    move: {
      position: WritingPosition;
      at: number;
      privateDocId: string | null;
    },
  ) {
    if (index === null) return;
    if (move.position === "private")
      before.set(docId, { at: move.at, entry: index.writing.get(docId) });
    else before.delete(docId);
    if (move.privateDocId === null) made.delete(docId);
    else made.set(docId, { privateDocId: move.privateDocId, at: move.at });
    index.writing.set(docId, { position: move.position, at: move.at });
  },
  setAccess(docId: string, othersHaveAccess: boolean) {
    if (access.get(docId) === othersHaveAccess) return;
    access.set(docId, othersHaveAccess);
    tell();
  },
  access: (docId: string) => access.get(docId) ?? null,
});
