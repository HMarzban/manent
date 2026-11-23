// What keeps the Writing switch current while a script is open: who has access to it, its position once page
// numbers are locked, someone else's hand-in, and an episode the person writes opening privately.
import type { PersonServices } from "../services/ports.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { writingActions } from "../state/writing.store.ts";
import { sayNotStarted, startPrivately } from "./choose.ts";
import type { ChoiceServices } from "./choose.ts";
import { othersHandIns } from "./hand-in.ts";
import { LOCKED_BACK, handedInByMessage } from "./messages.ts";
import { askPeople } from "./requests.ts";
import {
  isFields,
  isWriterOf,
  keptPosition,
  projectOf,
} from "./writing-index.ts";
import type { WritingIndex } from "./writing-index.ts";

type FollowServices = ChoiceServices & Pick<PersonServices, "projectIndex">;

/** The open script and what the person's world says of it now. */
interface Followed {
  docId: string;
  now: () => number;
  online: () => boolean;
}

const NOTHING = (): void => {};

/** Asks who has a role on `docId` and keeps the answer; while none comes, the last one kept stands. */
function askAccess(services: FollowServices, docId: string): void {
  void askPeople(services.userId, docId).then((people) => {
    if (people !== null) writingActions.setAccess(docId, people.length >= 2);
  });
}

/** Tells `hear` the kind of each control frame of `docId`'s handle, until the returned function stops it. */
function followControls(
  services: FollowServices,
  docId: string,
  hear: (kind: string, data: Uint8Array) => void,
): () => void {
  let stopped = false;
  let stop = NOTHING;
  void services.openHandle(docId).then(
    (handle) => {
      if (stopped) return void handle.close();
      const off = handle.on((event) => {
        if (event.type === "control") hear(event.kind, event.data);
      });
      stop = () => {
        off();
        void handle.close();
      };
    },
    () => {
      // a sync that could not start sends no control frame
    },
  );
  return () => {
    stopped = true;
    stop();
  };
}

/** A `handed_in` frame's data, as UTF-8 JSON; null when it does not read as one. */
function readHandedIn(
  data: Uint8Array,
): { userId: string; versionId: string; at: number; scenes: number } | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // a frame that is not JSON says nothing this build can read
    return null;
  }
  if (!isFields(value)) return null;
  const { userId, versionId, at, scenes } = value;
  if (typeof userId !== "string" || typeof versionId !== "string") return null;
  if (typeof at !== "number" || !Number.isSafeInteger(at)) return null;
  if (typeof scenes !== "number" || !Number.isSafeInteger(scenes)) return null;
  return { userId, versionId, at, scenes };
}

/** Says someone else's hand-in to everyone else in the script; the writer's own is said where it was made. */
function sayHandedIn(
  services: FollowServices,
  docId: string,
  data: Uint8Array,
): void {
  const handedIn = readHandedIn(data);
  if (handedIn === null || handedIn.userId === services.userId) return;
  othersHandIns.set(docId, { versionId: handedIn.versionId, at: handedIn.at });
  services.messages.push(
    handedInByMessage(nameOf(handedIn.userId), handedIn.scenes),
  );
}

/**
 * Starts an episode privately when its project names the person its writer and they have kept no position for it,
 * once the index says where the episode is; offline it stays written for everyone.
 */
function followOwnEpisode(
  services: FollowServices,
  followed: Followed,
): () => void {
  const { docId } = followed;
  let asked = false;
  const ask = async (index: WritingIndex): Promise<void> => {
    const projectId = await projectOf(services, index, docId);
    if (projectId === null || !(await isWriterOf(services, projectId, docId)))
      return;
    if (keptPosition(index, docId) === null)
      await startPrivately(services, docId, followed.now);
  };
  const check = (): void => {
    const index = writingActions.index();
    if (asked || index === null || !followed.online()) return;
    if (keptPosition(index, docId) !== null) {
      asked = true;
      return;
    }
    if (index.continued.get(docId) === null) return;
    asked = true;
    void ask(index).catch(() => {
      // the indexes that would say are not on this device: the episode stays written for everyone
    });
  };
  let stopContinued = NOTHING;
  const follow = (): void => {
    const index = writingActions.index();
    if (index !== null && stopContinued === NOTHING)
      stopContinued = index.continued.subscribe(check);
    check();
  };
  follow();
  const stopIndex = writingActions.subscribe(follow);
  return () => {
    stopIndex();
    stopContinued();
  };
}

/** Moves `docId` off As suggestions once its page numbers are locked, and says so: the person did not ask for it. */
function followLock(
  services: FollowServices,
  docId: string,
  now: () => number,
): () => void {
  const check = (): void => {
    const index = writingActions.index();
    if (index === null || keptPosition(index, docId) !== "suggestions") return;
    if (productionContextActions.get(docId)?.locked !== true) return;
    writingActions.keep(docId, {
      position: "everyone",
      at: now(),
      privateDocId: null,
    });
    services.messages.push(LOCKED_BACK);
  };
  check();
  const stops = [
    productionContextActions.subscribe(check),
    writingActions.subscribe(check),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/** Keeps the switch current for the open script `followed.docId` until the returned function stops it. */
export function followScript(
  services: FollowServices,
  followed: Followed,
): () => void {
  const { docId } = followed;
  writingActions.bind(services);
  askAccess(services, docId);
  const stops = [
    followControls(services, docId, (kind, data) => {
      // the signal carries nothing: who has access is asked again
      if (kind === "membership_changed") askAccess(services, docId);
      if (kind === "handed_in") sayHandedIn(services, docId, data);
    }),
    followLock(services, docId, followed.now),
    followOwnEpisode(services, followed),
    // a copy chosen on another device or tab that this one cannot open is said, as one chosen here is
    writingActions.onGivenUp(docId, (outcome) =>
      sayNotStarted(services, outcome),
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
