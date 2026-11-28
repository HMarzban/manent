// Point-in-time CommandContext.driver snapshot for room.takeKeys and room.pitch without keystroke subscriptions.
import type { CommandContext } from "@manent/commands";
import { currentDriver, firstNameOf } from "./driver.ts";
import { driverSpeechBlockId } from "./pitch.ts";

/** Reads the open script's room driver state lazily on command/palette evaluation (zero keystroke re-renders). */
export function driverCommandContext(
  userId: string,
  docId: string,
): CommandContext["driver"] {
  const driver = currentDriver(userId, docId);
  if (driver === null) return { active: false, isSelf: false, name: null };
  const isSelf = driver.userId === userId;
  const name = firstNameOf(driver.name);
  if (isSelf) return { active: true, isSelf: true, name };
  return {
    active: true,
    isSelf: false,
    name,
    caretInSpeech: driverSpeechBlockId(docId, driver.userId) !== null,
  };
}
