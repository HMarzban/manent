// The Send screen's form ids and their addresses, which the router and the commands need in the entry; the forms
// themselves load with the screen.

/** In the order the Send screen offers them. */
export const SEND_FORM_IDS = [
  "export",
  "print",
  "send_draft",
  "issue",
  "recall",
] as const;
export type SendFormId = (typeof SEND_FORM_IDS)[number];

export function sendPath(docId: string, form: SendFormId): string {
  return `/s/${docId}/send/${form}`;
}
