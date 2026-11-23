// The Send screen's forms: one line per form, in the order of SEND_FORM_IDS.
import type { ComponentType } from "react";
import { issueForm } from "../../production/send/issue-form.tsx";
import { recallForm } from "../../production/send/recall-form.tsx";
import { exportForm } from "../../send/export-form.tsx";
import { printForm } from "../../send/print-form.tsx";
import { sendDraftForm } from "../../send-draft/send-draft-form.tsx";
import type { SendFormId } from "./form-ids.ts";

// the ids and their addresses live apart, so that the entry, which needs them, does not load the forms
export { SEND_FORM_IDS, sendPath } from "./form-ids.ts";

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
  sendDraftForm,
  issueForm,
  recallForm,
];
