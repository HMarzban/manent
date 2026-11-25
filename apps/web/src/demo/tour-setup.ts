// What Set it up does: the scenario's preparation on the server, then its person, its page and its other windows.
import type { TourScenario } from "@manent/demo";
import type { TourPrepareResponse } from "@manent/sync-protocol";

/** `unreachable`: the preparation got no answer; `popup_blocked`: the browser refused to open an extra window. */
export type SetupOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: "used" | "seeding" | "unknown" | "unreachable" | "popup_blocked";
    };

/**
 * Runs the scenario's preparation when it has one, then makes the tab the scenario's person (`switchPerson` leaves a tab
 * that is that person already as it is), opens its page here and each extra window with its panels closed. A preparation
 * that is refused, or gets no answer, stops it before anything is opened.
 */
export async function runSetup(
  scenario: TourScenario,
  deps: {
    prepare(id: string): Promise<TourPrepareResponse>;
    switchPerson(userId: string): Promise<void>;
    navigate(path: string): void;
    /** Returns false when the browser blocked the pop-up window. */
    openWindow(url: string): boolean;
  },
): Promise<SetupOutcome> {
  const { setup } = scenario;
  if (setup.prepare !== null) {
    const answer = await deps.prepare(scenario.id).catch(() => null);
    if (answer === null) return { ok: false, reason: "unreachable" };
    if (!answer.ok) return answer;
  }
  await deps.switchPerson(setup.userId);
  deps.navigate(setup.open);
  for (const extra of setup.extraWindows) {
    const opened = deps.openWindow(
      `${extra.open}?person=${extra.userId}&panels=closed`,
    );
    if (!opened) return { ok: false, reason: "popup_blocked" };
  }
  return { ok: true };
}
