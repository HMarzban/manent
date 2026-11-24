// The room window's controller: claims keys when nobody drives, shows only the driver's caret, follows their
// latest cursor at most once per frame, and releases keys on close only when this person is the driver.
import type { CursorPlace, RemoteCursor } from "@manent/editor";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import type { LiveEditor } from "../editor-host/live-editor.ts";
import {
  remoteCursorsOf,
  scrollToPerson,
  setShownCursors,
} from "../editor-host/margin-people.ts";
import type { PersonServices } from "../services/ports.ts";
import {
  currentDriver,
  releaseDriver,
  subscribeDriver,
  takeDriver,
  watchDriver,
} from "./driver.ts";

const noop = (): void => {};

/** The caret of the tab of `userId` that moved last; null when they have none. */
function latestPlaceOf(
  cursors: readonly RemoteCursor[],
  userId: string,
): CursorPlace | null {
  let latest: RemoteCursor | null = null;
  for (const cursor of cursors)
    if (cursor.userId === userId && (latest?.movedAt ?? -1) <= cursor.movedAt)
      latest = cursor;
  return latest?.place ?? null;
}

export function startRoomFollow(options: {
  docId: string;
  services: PersonServices;
  frame: (fn: () => void) => () => void;
}): () => void {
  const { docId, services, frame } = options;
  let lastPlace: CursorPlace | null = null;
  let lastDriverUserId: string | null = null;
  let cancelFrame: (() => void) | null = null;
  let stopPresence = noop;
  let watched: LiveEditor | null = null;

  const scheduleScroll = (live: LiveEditor, place: CursorPlace): void => {
    cancelFrame?.();
    cancelFrame = frame(() => {
      cancelFrame = null;
      if (!live.view.isDestroyed) scrollToPerson(live.view, place);
    });
  };

  const applyShownAndFollow = (
    live: LiveEditor,
    cursors: readonly RemoteCursor[],
  ): void => {
    const driver = currentDriver(services.userId, docId);
    const driverUserId = driver?.userId ?? null;
    if (driverUserId !== lastDriverUserId) {
      lastDriverUserId = driverUserId;
      lastPlace = null;
    }
    setShownCursors(live.view, driverUserId === null ? [] : [driverUserId]);
    if (driverUserId === null) return;
    const next = latestPlaceOf(cursors, driverUserId);
    // when the driver's presence lapses, the window stays where it was until driver_changed or a new caret arrives
    if (next === null || JSON.stringify(next) === JSON.stringify(lastPlace))
      return;
    lastPlace = next;
    scheduleScroll(live, next);
  };

  const attachEditor = (): void => {
    const live = liveEditor(docId);
    if (live === watched) return;
    stopPresence();
    watched = live;
    if (live === null) return;
    stopPresence = live.presence.subscribe((cursors) =>
      applyShownAndFollow(live, cursors),
    );
    applyShownAndFollow(live, remoteCursorsOf(live.view));
  };

  const stopWatch = watchDriver(docId, services, {
    emitMessages: false,
    onResolved(driver, canEdit) {
      if (driver === null && canEdit)
        void takeDriver(docId, null, services, { announceLoss: false });
    },
  });
  const stopDriver = subscribeDriver(services.userId, docId, () => {
    if (watched !== null)
      applyShownAndFollow(watched, remoteCursorsOf(watched.view));
  });
  const stopEditors = subscribeLiveEditors(attachEditor);
  const stopSetting = services.settings.subscribe("writing.showCursors", () => {
    queueMicrotask(() => {
      if (watched !== null)
        applyShownAndFollow(watched, remoteCursorsOf(watched.view));
    });
  });
  attachEditor();

  const onClose = (): void => releaseDriver(services.userId, docId);
  window.addEventListener("pagehide", onClose);
  window.addEventListener("beforeunload", onClose);

  return () => {
    window.removeEventListener("pagehide", onClose);
    window.removeEventListener("beforeunload", onClose);
    cancelFrame?.();
    stopPresence();
    stopEditors();
    stopSetting();
    stopDriver();
    stopWatch();
    onClose();
  };
}
