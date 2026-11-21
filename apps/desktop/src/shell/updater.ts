// Updates: one an earlier run staged is applied at launch, before the node starts; while the app runs,
// checks download the next one, which waits for the next launch.
import type { ShellMessage, UpdateState } from "@manent/sync-protocol";
import {
  LAUNCH_UPDATE_WAIT_MS,
  mayApplyUpdate,
  nextUpdateState,
} from "../update-policy.ts";
import type { UpdateMoment } from "../update-policy.ts";
import { Updater } from "./sdk.ts";

/**
 * True when the apply began: this app's quit has started, and its helper opens the new version once
 * the quit ends. `applyUpdate` resolves whether it began or not, so the last status it logged tells which.
 */
async function applyStaged(moment: UpdateMoment): Promise<boolean> {
  if (!Updater.updateInfo().updateReady || !mayApplyUpdate(moment))
    return false;
  try {
    await Updater.applyUpdate();
  } catch {
    // the installed version goes on, and the next launch tries the staged update again
    return false;
  }
  return Updater.getStatusHistory().at(-1)?.status === "launching-new-version";
}

/**
 * Checks for an update, waiting at most `LAUNCH_UPDATE_WAIT_MS`, and applies one an earlier run
 * downloaded. True when the apply began, and the launch must stop there; false, and the launch goes on,
 * when the check is slow, offline or finds nothing staged.
 */
export async function updateAtLaunch(): Promise<boolean> {
  const answered = await Promise.race([
    Updater.checkForUpdate().then(() => true),
    Bun.sleep(LAUNCH_UPDATE_WAIT_MS).then(() => false),
  ]);
  return answered && (await applyStaged("launch"));
}

/** The answer of one check and, when it finds an update, of its download. */
async function checkAndDownload(): Promise<"none" | "downloaded" | "failed"> {
  const found = await Updater.checkForUpdate();
  if (found.error !== "") return "failed";
  if (found.updateReady) return "downloaded";
  if (!found.updateAvailable) return "none";
  try {
    await Updater.downloadUpdate();
  } catch {
    // a download that could not start is answered as one that failed
    return "failed";
  }
  return Updater.updateInfo().updateReady ? "downloaded" : "failed";
}

/**
 * The checks while the app runs. Each `check` sends `update_state`: `checking`, then the answer.
 * A check while one runs, or once an update is ready, sends the current state and starts nothing.
 */
export function createRunningUpdates(send: (message: ShellMessage) => void): {
  check(): void;
} {
  let state: UpdateState | null = null;
  const tell = (event: Parameters<typeof nextUpdateState>[1]): boolean => {
    const next = nextUpdateState(state, event);
    const kept = next === state;
    state = next;
    send({ v: 1, t: "update_state", state });
    return kept;
  };
  return {
    check() {
      if (tell("check")) return;
      void checkAndDownload().then(async (answer) => {
        tell(answer);
        await applyStaged("running");
      });
    },
  };
}
