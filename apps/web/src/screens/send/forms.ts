// The Send screen's forms: one line per form, in the order of SEND_FORM_IDS.
import type { ComponentType } from "react";
import { exportForm } from "../../send/export-form.tsx";
import { printForm } from "../../send/print-form.tsx";

/** In the order the Send screen offers them. */
export const SEND_FORM_IDS = [
  "export",
  "print",
  "send_draft",
  "issue",
  "recall",
] as const;
export type SendFormId = (typeof SEND_FORM_IDS)[number];

export interface SendFormProps {
  readonly docId: string;
}

export interface SendForm {
  readonly id: SendFormId;
  /** A hook; false means the form is absent here (role, state), and the route goes back to the document. */
  useAvailable(docId: string): boolean;
  /** Renders one SendFrame. */
  readonly Body: ComponentType<SendFormProps>;
}

export const SEND_FORMS: readonly SendForm[] = [
  exportForm,
  printForm,
  // issue and recall arrive with production revisions, send_draft later
];

export function sendPath(docId: string, form: SendFormId): string {
  return `/s/${docId}/send/${form}`;
}
