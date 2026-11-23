// Moving the person's writing in a script from one position to another.
import { WRITING_WORDS, messageFor } from "@manent/ui";
import { whenHeld } from "../editor-host/sync-sessions.ts";
import type { PersonServices } from "../services/ports.ts";
import { writingActions } from "../state/writing.store.ts";
import { compareCopy } from "./compare-copy.ts";
import { leftPrivatelyMessage } from "./messages.ts";
import { createPrivateCopy } from "./requests.ts";

export type ChoiceServices = Pick<
  PersonServices,
  "userId" | "openHandle" | "messages" | "commands" | "history"
>;

/**
 * Writes `docId` for everyone or as suggestions from `at` (milliseconds since the epoch). A private copy left with
 * changes not handed in stays open to return to, and the message slot says so.
 */
export function writePublicly(
  services: ChoiceServices,
  docId: string,
  move: { position: "everyone" | "suggestions"; at: number },
): void {
  const left = writingActions.openTarget(docId);
  writingActions.keep(docId, { ...move, privateDocId: null });
  if (left === docId) return;
  void compareCopy(services, docId, left).then((changes) => {
    const scenes = changes?.scenes.length ?? 0;
    if (scenes > 0) services.messages.push(leftPrivatelyMessage(scenes));
  });
}

/**
 * Writes `docId` in the person's private copy, which the server makes when they have none open, from the moment the
 * copy is on this device. `not_synced`: the server has never held the script; `refused`: the server made no copy, or
 * the private index, where the position is kept, has not been read yet.
 */
export async function startPrivately(
  services: ChoiceServices,
  docId: string,
  now: () => number,
): Promise<{ ok: true } | { ok: false; reason: "not_synced" | "refused" }> {
  if (writingActions.index() === null) return { ok: false, reason: "refused" };
  const handle = await services.openHandle(docId);
  const synced = handle.lastServerSeq() > 0;
  void handle.close();
  if (!synced) return { ok: false, reason: "not_synced" };
  const privateDocId = await createPrivateCopy(services.userId, docId);
  if (privateDocId === null) return { ok: false, reason: "refused" };
  // the position moves once the copy is on this device, so the page shows it at once and nothing typed under the
  // privacy line reaches the script
  const copy = await services.openHandle(privateDocId);
  await new Promise<void>((resolve) => {
    whenHeld(copy, () => resolve());
  });
  await copy.close();
  writingActions.keep(docId, {
    position: "private",
    at: now(),
    privateDocId,
  });
  return { ok: true };
}

/** Chooses Privately for `docId`; on a script the server has never held, the message slot says why it cannot start. */
export async function writePrivately(
  services: ChoiceServices,
  docId: string,
  now: () => number,
): Promise<void> {
  const started = await startPrivately(services, docId, now);
  if (started.ok || started.reason !== "not_synced") return;
  const { label } = services.commands.state("writing.privately");
  services.messages.push(
    messageFor({
      kind: "command_unavailable",
      label,
      reason: WRITING_WORDS.needsSynced,
    }),
  );
}
