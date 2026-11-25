// The prompter window of a rundown.
import { openPresentWindow } from "../screens/present/open-window.ts";

/** `open` opens the prompter window of the rundown `rundownId`; false when the browser blocked the pop-up. */
export const prompterWindowActions: { open(rundownId: string): boolean } =
  Object.freeze({
    open(rundownId: string): boolean {
      return openPresentWindow(rundownId, "prompter");
    },
  });
