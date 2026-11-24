// The prompter window of a rundown.
import { openPresentWindow } from "../screens/present/open-window.ts";

/** `open` opens the prompter window of the rundown `rundownId`. */
export const prompterWindowActions: { open(rundownId: string): void } =
  Object.freeze({
    open(rundownId: string): void {
      openPresentWindow(rundownId, "prompter");
    },
  });
