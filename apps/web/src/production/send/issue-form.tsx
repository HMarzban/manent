import type { SendForm } from "../../screens/send/forms.ts";

export const issueForm: SendForm = {
  id: "issue",
  useAvailable: () => false,
  Body: () => null,
};
