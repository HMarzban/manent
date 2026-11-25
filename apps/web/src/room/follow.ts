// Following another person's caret: this person's view tracks it on this device only, and nothing is sent or told
// to anyone. Any of the follower's own ways of moving the page ends it, as does the other person leaving.
import type { CursorPlace, RemoteCursor } from "@manent/editor";
import { ROOM_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { LiveEditor } from "../editor-host/live-editor.ts";
import {
  remoteCursorsOf,
  scrollToPerson,
} from "../editor-host/margin-people.ts";
import type { PersonServices } from "../services/ports.ts";
import { firstNameOf } from "./driver.ts";
import { whileLive } from "./margin-people-live.ts";
import { followed, takeChosen } from "./follow-state.ts";
import type { Followed } from "./follow-state.ts";
import { peoplePresent } from "./people-present.ts";

const PAGE_REGION = "[data-region='page']";
/** The follower's own ways of moving the page: a key, a press (on its scrollbar too), a wheel, a touch. */
const OWN_MOVES = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
const MODIFIERS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
]);

/** The follower moved the page or chose Stop; the followed person left or went out of reach; the follower left the document. */
type End = "stopped" | "gone" | "left";

interface FollowOptions {
  services: PersonServices;
  /** Runs `fn` at the next frame; returns the cancel. */
  frame: (fn: () => void) => () => void;
}

const noop = (): void => {};

// ends the following under way, said or unsaid; null while nobody is followed
let ending: ((end: End) => void) | null = null;

/** The caret of the tab of `userId` that moved last; null when they have none. */
function placeOf(
  cursors: readonly RemoteCursor[],
  userId: string,
): CursorPlace | null {
  let latest: RemoteCursor | null = null;
  for (const cursor of cursors)
    if (cursor.userId === userId && (latest?.movedAt ?? -1) <= cursor.movedAt)
      latest = cursor;
  return latest?.place ?? null;
}

function endedMessage(end: "stopped" | "gone", name: string): Message {
  return {
    id: "following_ended",
    text:
      end === "stopped"
        ? ROOM_WORDS.stoppedFollowing(name)
        : ROOM_WORDS.followedLeft(name),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/** Tracks `who` in one editor of the document: its scroll, at most once a frame, and every way the following ends there. */
function track(
  live: LiveEditor,
  who: Followed,
  options: FollowOptions,
  end: (end: End) => void,
): () => void {
  const { view, presence } = live;
  const { documents } = options.services;
  const { status } = documents.open(who.docId);
  let place = placeOf(remoteCursorsOf(view), who.userId);
  let cancelFrame: (() => void) | null = null;
  const scroll = (): void => {
    cancelFrame = null;
    if (place !== null && !view.isDestroyed) scrollToPerson(view, place);
  };
  const request = (): void => {
    cancelFrame ??= options.frame(scroll);
  };
  const stopCursors = whileLive(
    presence.subscribe,
    status,
  )((cursors) => {
    const next = placeOf(cursors, who.userId);
    // a caret that left the blocks keeps the view where it last was
    if (next === null || JSON.stringify(next) === JSON.stringify(place)) return;
    place = next;
    request();
  });
  const stopPeople = whileLive(
    presence.subscribePeople,
    status,
  )((people) => {
    if (!people.some((person) => person.userId === who.userId)) end("gone");
  });
  const region = view.dom.closest<HTMLElement>(PAGE_REGION) ?? view.dom;
  const onMove = (event: Event): void => {
    if (event instanceof KeyboardEvent && MODIFIERS.has(event.key)) return;
    end("stopped");
  };
  for (const type of OWN_MOVES)
    region.addEventListener(type, onMove, { capture: true, passive: true });
  request();
  return () => {
    cancelFrame?.();
    stopCursors();
    stopPeople();
    documents.close(who.docId);
    for (const type of OWN_MOVES)
      region.removeEventListener(type, onMove, { capture: true });
  };
}

/**
 * Follows the person chosen last in the people list, while they are present in that document's open editor and are
 * not this person; whoever was followed before stops being followed, unsaid. It follows the document's editor when
 * it is built again, and ends unsaid when the document has no editor any more.
 */
export function startFollowing(options: FollowOptions): void {
  const target = takeChosen();
  if (target === null || target.userId === options.services.userId) return;
  const live = liveEditor(target.docId);
  if (live === null) return;
  const person = peoplePresent(target.docId)
    .get()
    .find((p) => p.userId === target.userId);
  if (person === undefined) return;
  ending?.("left");
  const who: Followed = { ...target, name: firstNameOf(person.name) };
  let watched = live;
  let detach = noop;
  let stopEditors = noop;
  const finish = (end: End): void => {
    if (ending !== finish) return;
    ending = null;
    detach();
    stopEditors();
    followed.set(null);
    if (end !== "left")
      options.services.messages.push(endedMessage(end, who.name));
  };
  ending = finish;
  followed.set(who);
  detach = track(live, who, options, finish);
  stopEditors = subscribeLiveEditors(() => {
    const now = liveEditor(who.docId);
    if (now === watched) return;
    detach();
    if (now === null) {
      finish("left");
      return;
    }
    watched = now;
    detach = track(now, who, options, finish);
  });
}

/** Ends the following under way, and says so; nothing while nobody is followed. */
export function stopFollowing(): void {
  ending?.("stopped");
}
