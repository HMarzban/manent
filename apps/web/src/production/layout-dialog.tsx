// Change layout…: the consequence dialog that first says which locked pages a guarded setting's change affects.
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import { ConsequenceDialog, PRODUCTION_WORDS } from "@manent/ui";
import { useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import { layoutChangeImpact } from "../editor-host/production.ts";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import { useDialogRequest, useDialogServices } from "./dialog-context.ts";
import type { LayoutChange } from "./services.ts";

const WORDS = PRODUCTION_WORDS;
const NO_IMPACT = Object.freeze({ gainAPages: [], fallShort: [] });

/** The script's value of a registered setting; null for any other key. */
const readOf =
  (store: SettingsStore) =>
  (key: string): unknown => {
    const def = SETTINGS.all.find((held) => held.key === key);
    return def === undefined ? null : store.get(def.key);
  };

export function ChangeLayoutDialog(props: {
  change: LayoutChange | null;
  onClose(): void;
}): ReactNode {
  const { change, onClose } = props;
  const services = useDialogServices();
  const { docId } = services;
  const store = useServices().openScriptStore(docId);
  const active = useProductionContext(docId)?.activeName ?? "";
  const request = useDialogRequest("production.changeLayout", change !== null);
  // a changed answer lays the pages out again, from the document as the server now holds it
  const [counted, countAgain] = useReducer((n: number) => n + 1, 0);
  const affected = useMemo(
    () =>
      change === null
        ? NO_IMPACT
        : (layoutChangeImpact(docId, readOf(store), change) ?? NO_IMPACT),
    [docId, store, change, counted],
  );
  // the dialog keeps its words while it closes
  const last = useRef(change);
  if (change !== null) last.current = change;
  const what =
    last.current === null
      ? ""
      : `${last.current.noun} to ${last.current.valueLabel}`;
  const send = (): void => {
    if (change === null) return;
    request.send(
      () =>
        services.client.layout({
          changes: [{ key: change.key, value: change.value }],
          affected: {
            gainAPages: [...affected.gainAPages],
            fallShort: [...affected.fallShort],
          },
        }),
      {
        ok: onClose,
        refused: (code) => (code === "changed" ? countAgain() : onClose()),
      },
    );
  };
  return (
    <ConsequenceDialog
      open={change !== null}
      title={WORDS.changeLayoutTitle(what)}
      body={WORDS.changeLayoutBody(
        affected.gainAPages.length,
        affected.fallShort.length,
        active,
      )}
      action={WORDS.changeLayoutButton(what)}
      busyLabel={request.busy ? WORDS.changingLayoutButton(what) : null}
      refusal={null}
      disabledReason={request.disabledReason}
      destructive={false}
      onAction={send}
      onCancel={onClose}
    />
  );
}
