// The Send screen's Export form.
import type { SendForm } from "../screens/send/forms.ts";

export const exportForm: SendForm = {
  id: "export",
  useAvailable: () => false,
  Body: () => null,
};
