// When an update may be applied, and what the page is told while the app looks for one.
import type { UpdateState } from "@manent/sync-protocol";

/** At launch, the longest wait for the update check before the node starts. */
export const LAUNCH_UPDATE_WAIT_MS = 1000;

export type UpdateMoment = "launch" | "running";

/** Applying quits the app and opens the new version, so it happens only before the node starts. */
export function mayApplyUpdate(moment: UpdateMoment): boolean {
  return moment === "launch";
}

/** A check while one runs, or once an update is ready, keeps the state: it starts nothing. */
export function nextUpdateState(
  current: UpdateState | null,
  event: "check" | "none" | "downloaded" | "failed",
): UpdateState {
  switch (event) {
    case "check":
      return current === "checking" || current === "ready"
        ? current
        : "checking";
    case "none":
      return "up_to_date";
    case "downloaded":
      return "ready";
    case "failed":
      return "check_failed";
  }
}
