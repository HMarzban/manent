// The seed driver's folders and Trash in a workspace.
import { isSeedClock } from "./driving.ts";
import type { Driving } from "./driving.ts";

/** Moves `docId` to Trash as `userId` at `at` (epoch ms), through the server's real Trash route. */
export async function trashDocument(
  d: Driving,
  userId: string,
  docId: string,
  at: number,
): Promise<void> {
  if (isSeedClock(d.target.clock)) {
    d.target.clock.set(at);
    await d.runDue();
  }
  await d.call(userId, {
    method: "POST",
    path: "/api/trash/move",
    body: { docId },
  });
  await d.runDue();
}
