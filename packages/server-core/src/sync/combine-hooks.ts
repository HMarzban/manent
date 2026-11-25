// The sync hooks as one.
import type { SyncHooks } from "./ports.ts";

/** The hooks as one: each member asks every hook in list order; `subscribed` answers the first non-null. */
export function combineHooks(hooks: readonly SyncHooks[]): Required<SyncHooks> {
  return {
    committed(committed) {
      for (const hook of hooks) hook.committed?.(committed);
    },
    editorLeft(room, userId) {
      for (const hook of hooks) hook.editorLeft?.(room, userId);
    },
    forgotten(room) {
      for (const hook of hooks) hook.forgotten?.(room);
    },
    subscribed(docId) {
      for (const hook of hooks) {
        const extras = hook.subscribed?.(docId) ?? null;
        if (extras !== null) return extras;
      }
      return null;
    },
    checkPush: (room, report, pusher) =>
      hooks.flatMap((hook) => hook.checkPush?.(room, report, pusher) ?? []),
  };
}
