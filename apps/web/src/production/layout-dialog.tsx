// Change layout…: the consequence dialog that first says which locked pages a guarded setting's change affects.
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import { ConsequenceDialog, PRODUCTION_WORDS } from "@manent/ui";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { layoutChangeImpact } from "../editor-host/production.ts";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import { useDialogRequest, useDialogServices } from "./dialog-context.ts";
import type { LayoutChange } from "./services.ts";

const WORDS = PRODUCTION_WORDS;
const NO_IMPACT = Object.freeze({ gainAPages: [], fallShort: [] });
const PAGE_PREVIEW_CAP = 12;

function formatPagePreview(labels: readonly string[]): string {
  if (labels.length <= PAGE_PREVIEW_CAP) return labels.join(", ");
  return `${labels.slice(0, PAGE_PREVIEW_CAP).join(", ")}…`;
}

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
  const [countsRefreshed, setCountsRefreshed] = useState(false);

  useEffect(() => {
    if (change === null) setCountsRefreshed(false);
  }, [change]);

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
    setCountsRefreshed(false);
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
        // a changed answer restates the counts in the body, and the person decides again
        refused: (code) => {
          if (code !== "changed") return WORDS.changeLayoutRefused(what);
          setCountsRefreshed(true);
          countAgain();
          return null;
        },
      },
    );
  };
  const hasPreview =
    affected.gainAPages.length > 0 || affected.fallShort.length > 0;
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
      refusal={request.refusal}
      disabledReason={request.disabledReason}
      destructive={false}
      onAction={send}
      onCancel={onClose}
    >
      {hasPreview || countsRefreshed ? (
        <div className="flex flex-col gap-2 text-meta">
          {hasPreview ? (
            <div className="flex flex-col gap-1 rounded-surface border border-line bg-subtle px-3 py-2 text-fg-muted tabular-nums">
              {affected.gainAPages.length > 0 ? (
                <p>
                  {WORDS.pagesGainingAPages(
                    formatPagePreview(affected.gainAPages),
                  )}
                </p>
              ) : null}
              {affected.fallShort.length > 0 ? (
                <p>
                  {WORDS.pagesEndingEarly(
                    formatPagePreview(affected.fallShort),
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {countsRefreshed ? (
            <p role="status" className="text-attention">
              {WORDS.layoutCountsUpdated}
            </p>
          ) : null}
        </div>
      ) : null}
    </ConsequenceDialog>
  );
}
