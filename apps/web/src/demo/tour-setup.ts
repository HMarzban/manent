// What Set it up does: the scenario's preparation on the server, then its person, its page and its other windows.
import type { TourScenario } from "@manent/demo";
import type { TourPrepareResponse } from "@manent/sync-protocol";

/** `unreachable`: the preparation got no answer. */
export type SetupOutcome =
  | { ok: true }
  | { ok: false; reason: "used" | "seeding" | "unknown" | "unreachable" };

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
    openWindow(url: string): void;
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
  for (const extra of setup.extraWindows)
    deps.openWindow(`${extra.open}?person=${extra.userId}&panels=closed`);
  return { ok: true };
}
