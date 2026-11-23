// Where the person's typing in each document goes: to everyone as they type, as suggestions, or to a private copy.
import type { Subscribable } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import {
  copyEntryOf,
  keptPosition,
  openWritingIndex,
} from "../writing/writing-index.ts";
import type { WritingIndex } from "../writing/writing-index.ts";

const WRITING_POSITIONS = ["everyone", "suggestions", "private"] as const;
export type WritingPosition = (typeof WRITING_POSITIONS)[number];

type Bindable = Pick<PersonServices, "userId" | "openHandle">;

// the services whose private index is read; replaced when another person's services bind
let bound: Bindable | null = null;
let index: WritingIndex | null = null;
let stopIndex = (): void => {};
// by room docId: a private copy made in this tab, opened before the index holds its entry
const made = new Map<string, string>();
// by room docId: whether someone else has a role on it, the server's last answer in this tab
const access = new Map<string, boolean>();
const listeners = new Set<() => void>();
const followed = new Map<string, Subscribable<WritingPosition>>();

const tell = (): void => {
  for (const listener of listeners) listener();
};

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
 * Calls `open` each time `docId`'s target is another document than the one last asked for, starting from `opened`;
 * `wanted` says, once that target has opened, whether it is still the one to show. The returned function stops.
 */
function followTarget(
  docId: string,
  opened: string,
  open: (target: string, wanted: () => boolean) => void,
): () => void {
  let asked = opened;
  let stopped = false;
  const check = (): void => {
    const target = targetOf(docId);
    if (stopped || target === asked) return;
    asked = target;
    open(target, () => !stopped && asked === target);
  };
  const stop = followPosition(docId).subscribe(check);
  // the target may have moved while `opened` was opening
  check();
  return () => {
    stopped = true;
    stop();
  };
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
  made.clear();
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
      tell();
    },
    () => {
      // a sync that could not start holds no private index: every document reads as written for everyone
    },
  );
}

/**
 * `writingPositionOf`: where the person's typing in a document goes. `openTarget`: the document the person's editor
 * of a document opens: their private copy while they write it privately, else the document itself; `followTarget`
 * hears it move. `get` is what a command's context reads, and `subscribe`'s listener hears every change. Until `bind`
 * has read the person's private index, every document reads as written for everyone.
 */
export const writingActions: {
  writingPositionOf(docId: string): Subscribable<WritingPosition>;
  openTarget(docId: string): string;
  followTarget(
    docId: string,
    opened: string,
    open: (target: string, wanted: () => boolean) => void,
  ): () => void;
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
