// What Issue and Recall share: the script as its open editor lays it out, the one request of a screen visit, and
// the way back to the page.
import type { CommandId } from "@manent/commands";
import type { RequestOutcome } from "@manent/sync-client";
import type {
  ProductionRefusal,
  ProductionRefusalBody,
} from "@manent/sync-protocol";
import {
  DIALOG_WORDS,
  PRODUCTION_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useReducer, useState, useSyncExternalStore } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { liveProduction } from "../../editor-host/production.ts";
import type { LiveProduction } from "../../editor-host/production.ts";
import type { SendAction } from "../../screens/send/send-frame.tsx";
import { useEnvironment } from "../../services/context.tsx";
import type { ProductionServices } from "../services.ts";

const WORDS = PRODUCTION_WORDS;

/** What production lays out in the document's open editor, read again each time its revised pages are published. */
export function useLiveProduction(
  docId: string,
  services: ProductionServices,
): { live: LiveProduction | null; countAgain(): void } {
  const revised = useSubscribable(services.revisedPages);
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  const [counted, countAgain] = useReducer((n: number) => n + 1, 0);
  const live = useMemo(
    () => liveProduction(docId),
    [docId, revised, editor, counted],
  );
  return { live, countAgain };
}

/**
 * One request per screen visit: its key is kept for a press after an offline answer, and made again after a
 * refusal, whose line `refused` answers; null leaves the screen with no line.
 */
export function useProductionSend(command: CommandId): {
  send<T>(
    ask: (key: string) => Promise<RequestOutcome<T>>,
    answers: {
      ok(value: T): void;
      refused(
        code: ProductionRefusal,
        body: ProductionRefusalBody | null,
      ): string | null;
    },
  ): void;
  /** The form's action while this device has `waiting` changes; after a refusal its button reads Try again. */
  action(
    labels: { label: string; busyLabel: string },
    waiting: number,
    run: (() => void) | null,
  ): SendAction;
} {
  const { randomId } = useEnvironment();
  // a request's key is 32 lower-case hex digits
  const newKey = (): string => randomId().replaceAll("-", "");
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offline = useCommandState(command).whyNot === WORDS.connectionReason;
  return {
    send(ask, answers) {
      setBusy(true);
      setProblem(null);
      void ask(key).then((outcome) => {
        setBusy(false);
        if (outcome.ok) answers.ok(outcome.value);
        else if (outcome.code !== "offline") {
          setKey(newKey());
          setProblem(answers.refused(outcome.code, outcome.body));
        }
      });
    },
    action({ label, busyLabel }, waiting, run) {
      const disabledReason = offline
        ? WORDS.connectionReason
        : waiting > 0
          ? WORDS.waitingReason(waiting)
          : null;
      const again = problem !== null && disabledReason === null;
      return {
        label: again ? DIALOG_WORDS.tryAgain : label,
        busyLabel,
        busy,
        disabledReason,
        problem,
        progress: null,
        cancel: null,
        run,
      };
    },
  };
}

/** Back to the document, in place of the form. */
export function useBackToPage(docId: string): () => void {
  const navigate = useNavigate();
  return () =>
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
}
