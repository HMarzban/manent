// Where the person's typing in each document goes: to everyone as they type, as suggestions, or to a private copy.
import type { Subscribable } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import {
  copyEntryOf,
  isFields,
  keptPosition,
  openWritingIndex,
} from "../writing/writing-index.ts";
import type { WritingIndex } from "../writing/writing-index.ts";

const WRITING_POSITIONS = ["everyone", "suggestions", "private"] as const;
export type WritingPosition = (typeof WRITING_POSITIONS)[number];

type Bindable = Pick<PersonServices, "userId" | "openHandle">;

/**
 * How an editor session's open of a target ended: `bound` once it shows it; `offline` or `refused` when it gave it up,
 * the link gone or the server refusing it first; `moved` when the target moved on before.
 */
export type TargetOutcome = "bound" | "offline" | "refused" | "moved";

/** What a script's editor session shows: the target it has bound, and the one it is opening, null while none is. */
interface Binding {
  bound: string;
  opening: string | null;
}

// the services whose private index is read; replaced when another person's services bind
let bound: Bindable | null = null;
let index: WritingIndex | null = null;
let stopIndex = (): void => {};
// the bound index has been read, or cannot be: until then no document's target is known
let known = false;
const knowing = new Set<() => void>();
// by room docId: a private copy made in this tab, opened before the index holds its entry
const made = new Map<string, string>();
// by room docId: whether someone else has a role on it, the server's last answer in this tab
const access = new Map<string, boolean>();
const listeners = new Set<() => void>();
const followed = new Map<string, Subscribable<WritingPosition>>();
// by room docId: what its editor session shows, published by the session
const bindings = new Map<string, Binding>();
// by room docId: those waiting for the session to bind a target, or give it up
const settling = new Map<
  string,
  Set<{ target: string; settle(outcome: TargetOutcome): void }>
>();
// by room docId: the entry kept before this tab moved it to private, and that move's `at`
const before = new Map<string, { at: number; entry: unknown }>();
// by room docId: the hand-ins that hold the editor read-only
const holds = new Map<string, number>();

const tell = (): void => {
  for (const listener of listeners) listener();
};

const settle = (
  docId: string,
  target: string,
  outcome: TargetOutcome,
): void => {
  for (const waiting of settling.get(docId) ?? []) {
    if (waiting.target !== target) continue;
    settling.get(docId)?.delete(waiting);
    waiting.settle(outcome);
  }
};

/** Puts back the position kept before this tab's move of `docId` to private, unless another has been kept since. */
function rollBack(docId: string): void {
  const prior = before.get(docId);
  before.delete(docId);
  if (prior === undefined || index === null) return;
  const entry = index.writing.get(docId);
  if (!isFields(entry) || entry.at !== prior.at) return;
  made.delete(docId);
  if (prior.entry === null) index.writing.delete(docId);
  else index.writing.set(docId, prior.entry);
}

/** The private copy `docId` opens while the person writes it privately; null while none is open. */
function copyOf(docId: string): string | null {
  if (index === null) return null;
  const entry = copyEntryOf(index, docId);
  const fresh = made.get(docId) ?? null;
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

/**
 * Publishes `opened` as what `docId`'s editor session shows, then calls `open` each time `docId`'s target is another
 * document than the one shown or being opened; `wanted` says whether that target is still the one to open. A target is
 * shown once `open` settles as `bound`; given up, this tab's move to it is rolled back, and the next change asks again.
 * The returned function stops.
 */
function followTarget(
  docId: string,
  opened: string,
  open: (target: string, wanted: () => boolean) => Promise<TargetOutcome>,
): () => void {
  const binding: Binding = { bound: opened, opening: null };
  let stopped = false;
  const leave = (): void => {
    const left = binding.opening;
    binding.opening = null;
    if (left !== null) settle(docId, left, "moved");
  };
  const check = (): void => {
    const target = targetOf(docId);
    if (stopped || target === binding.opening) return;
    leave();
    if (target === binding.bound) return;
    binding.opening = target;
    const wanted = (): boolean => !stopped && binding.opening === target;
    void open(target, wanted).then((outcome) => {
      if (!wanted()) return;
      binding.opening = null;
      settle(docId, target, outcome);
      // a target given up is asked again on the next change, never at once: it would fail again the same way
      if (outcome === "bound") {
        binding.bound = target;
        tell();
      } else if (outcome !== "moved") rollBack(docId);
    });
  };
  bindings.set(docId, binding);
  const stop = followPosition(docId).subscribe(check);
  // the target may have moved while `opened` was opening
  check();
  tell();
  return () => {
    stopped = true;
    stop();
    leave();
    if (bindings.get(docId) === binding) bindings.delete(docId);
    tell();
  };
}

/** How the editor session's open of `target` for `docId` ends; `bound` at once when no session shows `docId`. */
function whenBound(docId: string, target: string): Promise<TargetOutcome> {
  const binding = bindings.get(docId);
  if (binding === undefined || binding.bound === target)
    return Promise.resolve("bound");
  if (binding.opening !== target) return Promise.resolve("moved");
  return new Promise((resolve) => {
    const waiting = settling.get(docId) ?? new Set();
    settling.set(docId, waiting);
    waiting.add({ target, settle: resolve });
  });
}

/** Whether `docId`'s editor may take keys: its target is known and shown, and no hand-in holds it. */
function isWritable(docId: string): boolean {
  if (!known || (holds.get(docId) ?? 0) > 0) return false;
  const binding = bindings.get(docId);
  return binding === undefined || binding.bound === targetOf(docId);
}

/** Calls `then` once every document's target is known; the returned function stops waiting. */
function whenKnown(then: () => void): () => void {
  if (known) {
    then();
    return () => {};
  }
  knowing.add(then);
  return () => {
    knowing.delete(then);
  };
}

/** From now on every document's target is known. */
function learn(): void {
  known = true;
  const waiting = [...knowing];
  knowing.clear();
  for (const then of waiting) then();
  tell();
}

function followPosition(docId: string): Subscribable<WritingPosition> {
  const held = followed.get(docId);
  if (held !== undefined) return held;
  const position: Subscribable<WritingPosition> = {
    get: () => positionOf(docId),
    subscribe(listener) {
      const hear = (): void => listener(positionOf(docId));
      listeners.add(hear);
      return () => {
        listeners.delete(hear);
      };
    },
  };
  followed.set(docId, position);
  return position;
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
  void openWritingIndex(services).then(
    (opened) => {
      if (stopped) return opened.close();
      index = opened;
      const stops = [
        opened.writing.subscribe(tell),
        opened.copies.subscribe(tell),
      ];
      stopIndex = () => {
        for (const stop of stops) stop();
        opened.close();
      };
      learn();
    },
    () => {
      // a sync that could not start holds no private index: every document reads as written for everyone
      if (!stopped) learn();
    },
  );
}

/**
 * `writingPositionOf`: where the person's typing in a document goes. `openTarget`: the document the person's editor
 * of a document opens: their private copy while they write it privately, else the document itself; `followTarget`
 * hears it move, and `boundTarget` is the one the editor session shows. `get` is what a command's context reads, and
 * `subscribe`'s listener hears every change. Until `bind` has read the person's private index, every document reads as
 * written for everyone, and no target is known.
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
  whenKnown(then: () => void): () => void;
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
  followTarget,
  boundTarget: (docId: string): Subscribable<string | null> => ({
    get: () => bindings.get(docId)?.bound ?? null,
    subscribe(listener) {
      const hear = (): void => listener(bindings.get(docId)?.bound ?? null);
      listeners.add(hear);
      return () => {
        listeners.delete(hear);
      };
    },
  }),
  whenBound,
  isWritable,
  whenKnown,
  holdInput(docId: string) {
    holds.set(docId, (holds.get(docId) ?? 0) + 1);
    tell();
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      holds.set(docId, (holds.get(docId) ?? 1) - 1);
      tell();
    };
  },
  get: (docId: string) => ({
    position: positionOf(docId),
    othersHaveAccess: access.get(docId) ?? false,
  }),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
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
    else made.set(docId, move.privateDocId);
    index.writing.set(docId, { position: move.position, at: move.at });
  },
  setAccess(docId: string, othersHaveAccess: boolean) {
    if (access.get(docId) === othersHaveAccess) return;
    access.set(docId, othersHaveAccess);
    tell();
  },
  access: (docId: string) => access.get(docId) ?? null,
});
