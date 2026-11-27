// Try it on a copy first: the script as it is now copied into its project, opened beside the page, and locked there
// with the Lock dialog's choices, leaving the original as it was.
import type { LockRequest } from "@manent/sync-protocol";
import { COPIES_WORDS } from "@manent/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { openBeside } from "../beside/open-beside.ts";
import type { DialogRequest } from "../production/dialog-context.ts";
import { useProductionServices } from "../production/live-services.ts";
import type { ProductionServices } from "../production/services.ts";
import { useServices } from "../services/context.tsx";
import { copyLockedMessage, copyRefusedMessage } from "./messages.ts";

/** The numbering scheme, colour order and day the Lock dialog locks with. */
export type LockChoice = Omit<LockRequest, "docId" | "key">;

const COPY_SERVICES_TIMEOUT_MS = 15_000;

interface Copy {
  docId: string;
  title: string;
}

export interface LockOnCopy {
  /** From the press until the copy's editor beside the page has made its production services. */
  copying: boolean;
  /** True while the dialog's refusal is the copy's: Try again locks the same copy again. */
  refusedCopy: boolean;
  start(choice: LockChoice): void;
  retry(choice: LockChoice): void;
}

/**
 * The copy offer of the Lock dialog of `docId` while `open`, sending its lock through `request`. The copy's lock
 * waits for the copy's first sync; once it is locked, the reverse message is said and `onLocked` runs. A refused lock
 * keeps the copy.
 */
export function useLockOnCopy(options: {
  docId: string;
  open: boolean;
  request: DialogRequest;
  onLocked(): void;
}): LockOnCopy {
  const { docId, open, request, onLocked } = options;
  const services = useServices();
  const [copying, setCopying] = useState(false);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [waiting, setWaiting] = useState<LockChoice | null>(null);
  const copyServices = useProductionServices(copy?.docId ?? null);
  const requestRef = useRef(request);
  requestRef.current = request;
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;

  const lock = useCallback(
    (target: ProductionServices, made: Copy, choice: LockChoice): void =>
      requestRef.current.send(() => target.client.lock(choice), {
        ok: () => {
          services.messages.push(copyLockedMessage(made.title));
          onLockedRef.current();
        },
        refused: () => COPIES_WORDS.copyLockRefused(made.title),
      }),
    [services.messages],
  );

  // a copy refused before the dialog closed is not the one Try again locks once it opens again
  useEffect(() => {
    if (open) return;
    setCopy(null);
    setWaiting(null);
    setCopying(false);
  }, [open]);

  // the copy's services are made by its editor beside the page, a moment after it opens
  useEffect(() => {
    if (waiting === null || copy === null) return undefined;
    if (copyServices !== null) {
      setWaiting(null);
      setCopying(false);
      lock(copyServices, copy, waiting);
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      setWaiting(null);
      setCopying(false);
      services.messages.push(copyRefusedMessage(copy.title));
    }, COPY_SERVICES_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [waiting, copy, copyServices, lock, services.messages]);

  return {
    copying,
    refusedCopy: request.refusal !== null && copy !== null,
    start(choice) {
      setCopying(true);
      // the copy loads apart from the first load, with ProseMirror's model
      void import("./duplicate.ts")
        .then(({ duplicate }) =>
          duplicate(services, { docId, versionId: null }),
        )
        .then(
          (made) => {
            if (!made.ok) {
              setCopying(false);
              if (made.reason === "not_saved")
                services.messages.push(copyRefusedMessage(made.title));
              return;
            }
            openBeside(made.docId, "script", null);
            setCopy({ docId: made.docId, title: made.title });
            setWaiting(choice);
          },
          // the person's sync could not start: nothing was copied, and the dialog stays as it was
          () => setCopying(false),
        );
    },
    retry(choice) {
      if (copy !== null && copyServices !== null)
        lock(copyServices, copy, choice);
    },
  };
}
