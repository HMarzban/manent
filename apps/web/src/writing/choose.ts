// Moving the person's writing in a script from one position to another.
import { WRITING_WORDS, messageFor } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { writingActions } from "../state/writing.store.ts";
import { createPrivateCopy } from "./requests.ts";

export type ChoiceServices = Pick<
  PersonServices,
  "userId" | "openHandle" | "messages" | "commands"
>;

/**
 * Writes `docId` in the person's private copy, which the server makes when they have none open, from the moment it
 * answers; a script the server has never held stays as it is, and the message slot says why.
 */
export async function writePrivately(
  services: ChoiceServices,
  docId: string,
  now: () => number,
): Promise<void> {
  if (writingActions.index() === null) return;
  const handle = await services.openHandle(docId);
  const synced = handle.lastServerSeq() > 0;
  void handle.close();
  if (!synced) {
    const { label } = services.commands.state("writing.privately");
    services.messages.push(
      messageFor({
        kind: "command_unavailable",
        label,
        reason: WRITING_WORDS.needsSynced,
      }),
    );
    return;
  }
  const privateDocId = await createPrivateCopy(services.userId, docId);
  if (privateDocId === null) return;
  writingActions.keep(docId, {
    position: "private",
    at: now(),
    privateDocId,
  });
}
