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
  /** `refused` is told every refusal but offline, which disables the action instead. */
  send<T>(
    ask: () => Promise<RequestOutcome<T>>,
    answers: { ok(value: T): void; refused(code: ProductionRefusal): void },
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
  // the connection is asked again each time the dialog opens
  useEffect(() => {
    if (!open) setOffline(false);
  }, [open]);
  return {
    busy,
    disabledReason:
      whyNot ?? (offline ? PRODUCTION_WORDS.connectionReason : undefined),
    send(ask, answers) {
      setBusy(true);
      void ask().then((outcome) => {
        setBusy(false);
        if (outcome.ok) answers.ok(outcome.value);
        else if (outcome.code === "offline") setOffline(true);
        else answers.refused(outcome.code);
      });
    },
  };
}
