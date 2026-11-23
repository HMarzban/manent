// What keeps the Writing switch current while a script is open: who has access to it, and its position once page
// numbers are locked.
import type { PersonServices } from "../services/ports.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { writingActions } from "../state/writing.store.ts";
import { LOCKED_BACK } from "./messages.ts";
import { askPeople } from "./requests.ts";
import { keptPosition } from "./writing-index.ts";

type FollowServices = Pick<
  PersonServices,
  "userId" | "openHandle" | "messages"
>;

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

/** Keeps the switch current for the open script `docId` until the returned function stops it. */
export function followScript(
  services: FollowServices,
  docId: string,
  now: () => number,
): () => void {
  writingActions.bind(services);
  askAccess(services, docId);
  const stops = [
    // the signal carries nothing: who has access is asked again
    followControls(services, docId, (kind) => {
      if (kind === "membership_changed") askAccess(services, docId);
    }),
    followLock(services, docId, now),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
