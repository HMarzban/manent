// A person's session on a document: it starts with their first push and ends when their last edit
// subscription ends, or when a while passes without a push of theirs.
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { Clock, SyncHooks } from "../sync/ports.ts";
import type { Room } from "../sync/rooms.ts";

/**
 * `ended` is called once per session. A setting, a replay, an update from upstream and a write
 * of the system user start none.
 */
export function createSessions(options: {
  clock: Clock;
  idleMs: number;
  ended(room: Room, userId: string): void;
}): Required<Pick<SyncHooks, "committed" | "editorLeft">> {
  const { clock, idleMs } = options;
  /** By room, then by user: cancels the session's idle timer. */
  const open = new Map<Room, Map<string, () => void>>();

  const end = (room: Room, userId: string): void => {
    const sessions = open.get(room);
    const cancel = sessions?.get(userId);
    if (sessions === undefined || cancel === undefined) return;
    cancel();
    sessions.delete(userId);
    if (sessions.size === 0) open.delete(room);
    options.ended(room, userId);
  };

  return {
    committed({ room, sender, report }) {
      if (report === null || sender === null) return;
      const { userId } = sender;
      if (userId === SYSTEM_USER_ID) return;
      const sessions = open.get(room) ?? new Map<string, () => void>();
      open.set(room, sessions);
      sessions.get(userId)?.();
      sessions.set(
        userId,
        clock.schedule(() => end(room, userId), idleMs),
      );
    },
    editorLeft(room, userId) {
      for (const peer of room.editors.keys())
        if (peer.userId === userId) return;
      end(room, userId);
    },
  };
}
