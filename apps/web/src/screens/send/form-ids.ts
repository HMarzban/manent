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

/** The test build's own form, which draws the Send frame from its address; no release offers it. */
export const TEST_SEND_FORM_ID = "test_form";

export function sendPath(docId: string, form: SendFormId): string {
  return `/s/${docId}/send/${form}`;
}
