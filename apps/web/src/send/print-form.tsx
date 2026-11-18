// The Send screen's Print form.
import type { SendForm } from "../screens/send/forms.ts";

export const printForm: SendForm = {
  id: "print",
  useAvailable: () => false,
  Body: () => null,
};
