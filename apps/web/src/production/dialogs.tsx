// The production dialogs of the shown script, drawn on the document screen: Lock for production, Change layout…,
// Unlock and End production. Each keeps a draft first, so none is drawn destructive.
import {
  ConsequenceDialog,
  PRODUCTION_WORDS,
  useSubscribable,
} from "@manent/ui";
import type { ReactNode } from "react";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import {
  DialogServices,
  useDialogRequest,
  useDialogServices,
} from "./dialog-context.ts";
import { ChangeLayoutDialog } from "./layout-dialog.tsx";
import { useProductionServices } from "./live-services.ts";
import { LockDialog } from "./lock-dialog.tsx";
import { NOTHING_OPEN } from "./services.ts";
import type { ProductionServices } from "./services.ts";

const WORDS = PRODUCTION_WORDS;

/** Unlock and End production, which ask nothing but the button. */
function EndingDialog(props: {
  kind: "unlock" | "end";
  open: boolean;
  onClose(): void;
}): ReactNode {
  const { kind, open, onClose } = props;
  const services = useDialogServices();
  const title = useDocumentTitle(services.docId);
  const active = useProductionContext(services.docId)?.activeName ?? "";
  const request = useDialogRequest(
    kind === "unlock" ? "production.unlock" : "production.end",
    open,
  );
  const words =
    kind === "unlock"
      ? {
          title: WORDS.unlockTitle,
          action: WORDS.unlockButton,
          busy: WORDS.unlockingButton,
          body: WORDS.unlockBody(title),
          refused: WORDS.unlockRefused,
          ask: services.client.unlock,
        }
      : {
          title: WORDS.endTitle,
          action: WORDS.endButton,
          busy: WORDS.endingButton,
          body: WORDS.endBody(active, title),
          refused: WORDS.endRefused,
          ask: services.client.end,
        };
  return (
    <ConsequenceDialog
      open={open}
      title={words.title}
      body={words.body}
      action={words.action}
      busyLabel={request.busy ? words.busy : null}
      refusal={request.refusal}
      disabledReason={request.disabledReason}
      destructive={false}
      onAction={() =>
        request.send(words.ask, {
          ok: onClose,
          refused: () => words.refused,
        })
      }
      onCancel={onClose}
    />
  );
}

function Dialogs(props: { services: ProductionServices }): ReactNode {
  const { services } = props;
  const open = useSubscribable(services.open);
  const close = (): void => services.open.set(NOTHING_OPEN);
  return (
    <DialogServices.Provider value={services}>
      <LockDialog open={open.kind === "lock"} onClose={close} />
      <ChangeLayoutDialog
        change={open.kind === "change_layout" ? open.change : null}
        onClose={close}
      />
      <EndingDialog
        kind="unlock"
        open={open.kind === "unlock"}
        onClose={close}
      />
      <EndingDialog kind="end" open={open.kind === "end"} onClose={close} />
    </DialogServices.Provider>
  );
}

/** Nothing until the script's production services exist. */
export function ProductionDialogs(props: { docId: string }): ReactNode {
  const services = useProductionServices(props.docId);
  return services === null ? null : <Dialogs services={services} />;
}
