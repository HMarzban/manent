// The Send screen's forms: one line per form, in the order of SEND_FORM_IDS, each heavy form body loaded on demand.
import { Suspense, createElement, lazy } from "react";
import type { ComponentType, ReactNode } from "react";
import { exportForm } from "../../send/export-form.tsx";
import { printForm } from "../../send/print-form.tsx";
import { useDraftSendAccess } from "../../send-draft/access.ts";
import { useProductionContext } from "../../state/production-context.store.ts";
import type { SendFormId, TEST_SEND_FORM_ID } from "./form-ids.ts";
import { SendFormSkeleton } from "./send-frame.tsx";

// the ids and their addresses live apart, so that the entry, which needs them, does not load the forms
export { SEND_FORM_IDS, sendPath } from "./form-ids.ts";

export interface SendFormProps {
  readonly docId: string;
}

export interface SendForm {
  readonly id: SendFormId | typeof TEST_SEND_FORM_ID;
  /** A hook; false means the form is absent here (role, state), and the route goes back to the document. */
  useAvailable(docId: string): boolean;
  /** Renders one SendFrame. */
  readonly Body: ComponentType<SendFormProps>;
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
    const production = useProductionContext(docId);
    return production !== null && production.locked && production.canIssue;
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
    const production = useProductionContext(docId);
    return production !== null && production.recallOpen && production.canIssue;
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
