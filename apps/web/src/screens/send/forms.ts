// The Send screen's forms: one line per form, in the order of SEND_FORM_IDS, each heavy form body loaded on demand.
import { SEND_WORDS, createValue, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { Suspense, createElement, lazy, useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useProductionServices } from "../../production/live-services.ts";
import { exportForm, useOfferedTo } from "../../send/export-form.tsx";
import { printForm } from "../../send/print-form.tsx";
import { useDraftSendAccess } from "../../send-draft/access.ts";
import { useEnvironment } from "../../services/context.tsx";
import { useProductionContext } from "../../state/production-context.store.ts";
import { useOpenDocument } from "../document/open-document.ts";
import type { SendFormId, TEST_SEND_FORM_ID } from "./form-ids.ts";
import { SendFormSkeleton } from "./send-frame.tsx";

// the ids and their addresses live apart, so that the entry, which needs them, does not load the forms
export { SEND_FORM_IDS, sendPath } from "./form-ids.ts";

export interface SendFormProps {
  readonly docId: string;
}

export type SendAvailability =
  | "loading"
  | "available"
  | { readonly kind: "unavailable"; readonly reason: string };

export interface SendForm {
  readonly id: SendFormId | typeof TEST_SEND_FORM_ID;
  /** A hook; false goes back to the document, while SendAvailability models hydration and clear in-frame refusal. */
  useAvailable(docId: string): boolean | SendAvailability;
  /** Renders one SendFrame. */
  readonly Body: ComponentType<SendFormProps>;
}

const HYDRATE_SETTLE_MS = 1_500;
const FALLBACK_STATUS: Subscribable<StatusFacts> = createValue<StatusFacts>({
  access: "view",
  device: "ok",
  network: "online",
  server: "syncing",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: false,
  shell: "web",
  toReview: 0,
  now: 0,
});

/**
 * Cold-route availability for Issue and Recall: stays "loading" while production state and capabilities hydrate,
 * then resolves to "available" or an in-frame explanation instead of redirecting silently.
 */
export function useProductionFormAvailability(
  docId: string,
  kind: "issue" | "recall",
): SendAvailability {
  const offered = useOfferedTo(docId);
  const opened = useOpenDocument(docId);
  const status = useSubscribable(opened?.status ?? FALLBACK_STATUS);
  const production = useProductionContext(docId);
  const services = useProductionServices(docId);
  const { online, schedule } = useEnvironment();
  const isOnline = online() && status.network === "online";

  const [settledDoc, setSettledDoc] = useState<string | null>(null);
  const waitingAccess =
    production !== null &&
    !production.canIssue &&
    services !== null &&
    services.view.access() === null &&
    isOnline;
  const needsHydration = production === null || waitingAccess;

  useEffect(() => {
    if (!needsHydration) return undefined;
    return schedule(() => setSettledDoc(docId), HYDRATE_SETTLE_MS);
  }, [docId, needsHydration, schedule]);

  const settled = settledDoc === docId;

  if (
    offered.docKind !== null &&
    (offered.docKind !== "script" || offered.format === "ink")
  ) {
    return { kind: "unavailable", reason: SEND_WORDS.formUnavailable };
  }
  if (
    opened !== null &&
    (status.server === "access_removed" || status.server === "deleted")
  ) {
    return { kind: "unavailable", reason: SEND_WORDS.formUnavailable };
  }
  if (production === null) {
    if (!settled) return "loading";
    return {
      kind: "unavailable",
      reason:
        kind === "issue" ? SEND_WORDS.issueNeedsLock : SEND_WORDS.recallClosed,
    };
  }
  if (kind === "issue") {
    if (!production.locked) {
      return { kind: "unavailable", reason: SEND_WORDS.issueNeedsLock };
    }
    if (production.canIssue) return "available";
    if (waitingAccess && !settled) return "loading";
    return { kind: "unavailable", reason: SEND_WORDS.issueNoPermission };
  }
  if (!production.recallOpen) {
    return { kind: "unavailable", reason: SEND_WORDS.recallClosed };
  }
  if (production.canIssue) return "available";
  if (waitingAccess && !settled) return "loading";
  return { kind: "unavailable", reason: SEND_WORDS.recallNoPermission };
}

/** Wraps a form body loaded apart so opening one form never pulls the others into the Send screen chunk. */
function lazyFormBody(
  load: () => Promise<ComponentType<SendFormProps>>,
  skeletonRows: number,
): ComponentType<SendFormProps> {
  const LazyBody = lazy(async () => ({ default: await load() }));
  return function LazySendFormBody(props: SendFormProps): ReactNode {
    return createElement(
      Suspense,
      { fallback: createElement(SendFormSkeleton, { rows: skeletonRows }) },
      createElement(LazyBody, props),
    );
  };
}

const sendDraftForm: SendForm = {
  id: "send_draft",
  useAvailable(docId) {
    return useDraftSendAccess(docId).available;
  },
  Body: lazyFormBody(
    async () =>
      (await import("../../send-draft/send-draft-form.tsx")).sendDraftForm.Body,
    5,
  ),
};

const issueForm: SendForm = {
  id: "issue",
  useAvailable(docId) {
    return useProductionFormAvailability(docId, "issue");
  },
  Body: lazyFormBody(
    async () =>
      (await import("../../production/send/issue-form.tsx")).issueForm.Body,
    5,
  ),
};

const recallForm: SendForm = {
  id: "recall",
  useAvailable(docId) {
    return useProductionFormAvailability(docId, "recall");
  },
  Body: lazyFormBody(
    async () =>
      (await import("../../production/send/recall-form.tsx")).recallForm.Body,
    3,
  ),
};

export const SEND_FORMS: readonly SendForm[] = [
  exportForm,
  printForm,
  sendDraftForm,
  issueForm,
  recallForm,
];
