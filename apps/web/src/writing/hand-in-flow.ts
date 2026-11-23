// Handing the person's private copy in: from the press until the page shows the room's script, or the hand-in is
// refused, the page takes no keys, and once the request has gone, closing the dialog no longer ends that.
import type { PersonServices } from "../services/ports.ts";
import { writingActions } from "../state/writing.store.ts";
import { handInShown, handedInVersions } from "./hand-in.ts";
import { handedInMessage } from "./messages.ts";
import type { HandInOutcome } from "./requests.ts";
import { syncedOf } from "./writing-index.ts";

type HandInServices = Pick<PersonServices, "openHandle" | "messages">;

// by room docId: the answer to a hand-in whose request has gone
const sent = new Map<string, Promise<HandInOutcome>>();

/**
 * Whether the person's open private copy of `docId` holds no change the server has not acknowledged: true once it holds
 * none; false once the link goes, or the server refuses the copy, first, or once `stop` ends the wait. The copy's
 * handle is let go as the wait ends.
 */
function watchDelivery(
  services: HandInServices,
  docId: string,
): { delivered: Promise<boolean>; stop(): void } {
  let stopped = false;
  let stop = (): void => {
    stopped = true;
  };
  const delivered = services.openHandle(docId).then(
    (handle) =>
      new Promise<boolean>((resolve) => {
        let done = false;
        let unsubscribe: (() => void) | null = null;
        const end = (answer: boolean): void => {
          if (done) return;
          done = true;
          unsubscribe?.();
          void handle.close();
          resolve(answer);
        };
        const check = (): void => {
          const answer = syncedOf(handle.status.get());
          if (answer !== null) end(answer);
        };
        stop = () => end(false);
        if (stopped) return end(false);
        unsubscribe = handle.status.subscribe(check);
        check();
      }),
  );
  return { delivered, stop: () => stop() };
}

/**
 * Hands in the person's private copy of `docId` once it holds no change the server has not acknowledged, so nothing
 * typed in it is left behind; `request` asks the server, and a retry under the same `key` answers the same again. The
 * page takes no keys until it shows the room's script, or the hand-in is refused. `cancel` ends it only before the
 * request goes: after that the answer is awaited, and a hand-in that went through moves the page to the room's script
 * and is said in the message slot. `outcome` is null when cancelled first. A hand-in whose request has gone is joined.
 */
export function startHandIn(
  services: HandInServices,
  docId: string,
  options: {
    key: string;
    now: () => number;
    request(request: { docId: string; key: string }): Promise<HandInOutcome>;
  },
): { outcome: Promise<HandInOutcome | null>; cancel(): void } {
  const going = sent.get(docId);
  if (going !== undefined) return { outcome: going, cancel: () => {} };
  const letGo = writingActions.holdInput(docId);
  const delivery = watchDelivery(services, docId);
  let requested = false;
  let cancelled = false;
  const ask = async (): Promise<HandInOutcome | null> => {
    // a copy this device cannot open is refused as a hand-in that did not go
    const delivered = await delivery.delivered.catch(() => false);
    if (cancelled) return null;
    if (!delivered) {
      letGo();
      return { ok: false, code: "failed" };
    }
    requested = true;
    const answer = options.request({ docId, key: options.key });
    sent.set(docId, answer);
    try {
      const outcome = await answer;
      if (!outcome.ok) return outcome;
      const { versionId, scenes, overlaps } = outcome.handedIn;
      // kept before the hold lets go, so the page stays read-only until it shows the room's script
      writingActions.keep(docId, {
        position: "everyone",
        at: options.now(),
        privateDocId: null,
      });
      handedInVersions.set(docId, versionId);
      handInShown.set(null);
      services.messages.push(handedInMessage(scenes, overlaps));
      return outcome;
    } finally {
      sent.delete(docId);
      letGo();
    }
  };
  return {
    outcome: ask(),
    cancel() {
      if (requested) return;
      cancelled = true;
      delivery.stop();
      letGo();
    },
  };
}
