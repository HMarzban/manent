// Moving the person's writing in a script from one position to another.
import { WRITING_WORDS, messageFor } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import { writingActions } from "../state/writing.store.ts";
import { compareCopy } from "./compare-copy.ts";
import { leftPrivatelyMessage } from "./messages.ts";
import { createPrivateCopy } from "./requests.ts";

/** Why Privately did not start; `startPrivately` says what each means. */
type NotStarted = "not_synced" | "refused" | "offline" | "moved";

// a failure the sheet gives no sentence for is not said
const WHY_NOT: Readonly<Record<NotStarted, string | null>> = Object.freeze({
  not_synced: WRITING_WORDS.needsSynced,
  refused: null,
  offline: WRITING_WORDS.needsConnection,
  moved: null,
});

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
 * Writes `docId` in the person's private copy, which the server makes when they have none open; the page is held
 * read-only until it shows the copy. `not_synced`: the server has never held the script; `refused`: the server made no
 * copy, the private index, where the position is kept, has not been read yet, or the page could not show the copy;
 * `offline`: the link went before the page could show it; `moved`: another position was chosen meanwhile. Unless
 * `moved`, the position is put back when the page cannot show the copy.
 */
export async function startPrivately(
  services: ChoiceServices,
  docId: string,
  now: () => number,
): Promise<{ ok: true } | { ok: false; reason: NotStarted }> {
  if (writingActions.index() === null) return { ok: false, reason: "refused" };
  const handle = await services.openHandle(docId);
  const synced = handle.lastServerSeq() > 0;
  void handle.close();
  if (!synced) return { ok: false, reason: "not_synced" };
  const privateDocId = await createPrivateCopy(services.userId, docId);
  if (privateDocId === null) return { ok: false, reason: "refused" };
  writingActions.keep(docId, {
    position: "private",
    at: now(),
    privateDocId,
  });
  const outcome = await writingActions.whenBound(docId, privateDocId);
  return outcome === "bound" ? { ok: true } : { ok: false, reason: outcome };
}

/** Chooses Privately for `docId`; the message slot says why it cannot start on a script never synced, or offline. */
export async function writePrivately(
  services: ChoiceServices,
  docId: string,
  now: () => number,
): Promise<void> {
  const started = await startPrivately(services, docId, now);
  if (started.ok) return;
  const reason = WHY_NOT[started.reason];
  if (reason === null) return;
  const { label } = services.commands.state("writing.privately");
  services.messages.push(
    messageFor({ kind: "command_unavailable", label, reason }),
  );
}
