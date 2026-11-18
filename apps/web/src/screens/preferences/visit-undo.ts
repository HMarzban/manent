// The undo list of one visit to Preferences: each change made on the screen, and how to put it back.
import type { SettingKey } from "@manent/settings";

/** What changed (a preference, or the shortcuts) and what it was; the list lasts for this visit only. */
export interface VisitUndo {
  record(key: SettingKey | "shortcuts", was: unknown): void;
  /** Puts back the last change recorded; false when there is none. */
  undo(): boolean;
}

/** `putBack` receives each record as it was given to `record`, the latest first. */
export function createVisitUndo(options: {
  putBack(key: SettingKey | "shortcuts", was: unknown): void;
}): VisitUndo {
  const records: { key: SettingKey | "shortcuts"; was: unknown }[] = [];
  return {
    record(key, was) {
      records.push({ key, was });
    },
    undo() {
      const last = records.pop();
      if (last === undefined) return false;
      options.putBack(last.key, last.was);
      return true;
    },
  };
}
