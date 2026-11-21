import type { SendForm } from "../../screens/send/forms.ts";

export const recallForm: SendForm = {
  id: "recall",
  useAvailable: () => false,
  Body: () => null,
};
