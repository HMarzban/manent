// The settings store Project settings draws its rows from: the project's own settings, and no preference.
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import type { Bag, SettingsStore } from "@manent/settings";
import type { Guard } from "../../state/guard.ts";

/** A row reads `canChange` as the bag's: one who may not change the project's settings sees every row read-only. */
export function createProjectStore(options: {
  bag: Bag;
  canChange: boolean;
  guard: Guard;
}): SettingsStore {
  const { bag, canChange, guard } = options;
  // the screen shows project settings only, so no preference is read or written here
  const nothing = createMemoryBag({ initial: {}, writable: () => false });
  return createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: nothing,
      device: nothing,
      script: null,
      project: canChange ? bag : { ...bag, canWrite: () => false },
    },
    beforeWrite: () => guard.check("settings"),
    // nothing on this screen is typed into the page, so a change from elsewhere lands at once
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
}
