// What every production dialog reads: the shown script's production services, and how a dialog sends its request.
import type { CommandId } from "@manent/commands";
import type { RequestOutcome } from "@manent/sync-client";
import type { ProductionRefusal } from "@manent/sync-protocol";
import { PRODUCTION_WORDS, useCommandState } from "@manent/ui";
import { createContext, useContext, useEffect, useState } from "react";
import type { ProductionServices } from "./services.ts";

export const DialogServices = createContext<ProductionServices | null>(null);

/** Throws a TypeError outside the production dialogs' host. */
export function useDialogServices(): ProductionServices {
  const services = useContext(DialogServices);
  if (services === null)
    throw new TypeError("a production dialog was drawn outside its host");
  return services;
}

export interface DialogRequest {
  busy: boolean;
  /** The command's reason clause, or the connection's once an answer came back offline. */
  disabledReason: string | undefined;
  /** What the last answer refused, until the next press or the dialog closes. */
  refusal: string | null;
  /**
   * `refused` is told every refusal but offline, which disables the action instead, and answers the dialog's
   * refusal line; null keeps the dialog as it is, with no line.
   */
  send<T>(
    ask: () => Promise<RequestOutcome<T>>,
    answers: {
      ok(value: T): void;
      refused(code: ProductionRefusal): string | null;
    },
  ): void;
}

/** The request of the dialog that `command` opens, while `open`. */
export function useDialogRequest(
  command: CommandId,
  open: boolean,
): DialogRequest {
  const { whyNot } = useCommandState(command);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // the connection is asked again, and nothing is refused, each time the dialog opens
  useEffect(() => {
    if (open) return;
    setOffline(false);
    setRefusal(null);
  }, [open]);
  return {
    busy,
    disabledReason:
      whyNot ?? (offline ? PRODUCTION_WORDS.connectionReason : undefined),
    refusal,
    send(ask, answers) {
      setBusy(true);
      setRefusal(null);
      void ask().then((outcome) => {
        setBusy(false);
        if (outcome.ok) answers.ok(outcome.value);
        else if (outcome.code === "offline") setOffline(true);
        else setRefusal(answers.refused(outcome.code));
      });
    },
  };
}
